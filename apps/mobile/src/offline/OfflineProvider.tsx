/**
 * OfflineProvider — wires the offline layer's lifecycle and exposes its state to
 * the app through one context.
 *
 * RESPONSIBILITIES:
 *   1. Start the connectivity service (NetInfo subscription) on mount, stop it on
 *      unmount.
 *   2. Start the sync engine so the append-only outbox drains whenever the device
 *      is online; stop it (and cancel retries) on unmount.
 *   3. Publish { isOnline, pendingSyncCount } so:
 *        - OfflineBanner renders offline / "N pending" without its own NetInfo
 *          listener (it consumes `useConnectivity()` — same shape it already
 *          expects).
 *        - useCourses picks local-vs-network based on `isOnline`.
 *
 * The provider owns NO tenant logic itself — the queue/sync/localStore each take
 * the verified tenantId from their callers. The provider just runs lifecycle and
 * surfaces connectivity + queue depth. It mounts INSIDE AuthProvider (per the
 * shell's documented seam in AppProviders) so, if needed, it can read the signed-
 * in identity; today it only needs connectivity + the queue.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { connectivity, useConnectivitySnapshot } from './netinfo';
import { completionQueue, syncEngine } from './singletons';

export interface OfflineContextValue {
  /** Reachability, derived from NetInfo (see netinfo.ts). */
  isOnline: boolean;
  /** Raw connection type (wifi/cellular/none/…). */
  connectionType: string;
  /** Count of xAPI statements queued locally awaiting sync. */
  pendingSyncCount: number;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const snap = useConnectivitySnapshot();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Start connectivity + sync lifecycle exactly once for the app's lifetime.
  useEffect(() => {
    connectivity.start();
    syncEngine.start();
    return () => {
      syncEngine.stop();
      connectivity.stop();
    };
  }, []);

  // Reactively track the unsynced queue depth (no polling — WatermelonDB emits a
  // new count whenever a statement is enqueued or marked synced). Guarded so an
  // unopenable store (e.g. the native SQLite module missing in a non-dev-client
  // context) degrades to "0 pending" instead of crashing the app.
  //
  // This observer is ALSO the immediate-sync kick: the engine otherwise drains
  // only on connectivity TRANSITIONS and backoff retries, so a statement
  // enqueued while the device is steadily online would sit locally until a
  // network flap or an app restart. Whenever the pending count is non-zero we
  // fire-and-forget a drain — `syncNow()` is connectivity-gated (a no-op while
  // offline) and concurrency-guarded (a no-op while a drain is in flight), so
  // this is safe to call on every emission and covers EVERY enqueue site
  // without coupling the queue to the engine.
  useEffect(() => {
    try {
      const subscription = completionQueue.observePendingCount().subscribe({
        next: (count) => {
          setPendingSyncCount(count);
          if (count > 0) void syncEngine.syncNow();
        },
        error: () => setPendingSyncCount(0),
      });
      return () => subscription.unsubscribe();
    } catch {
      setPendingSyncCount(0);
      return undefined;
    }
  }, []);

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOnline: snap.isOnline,
      connectionType: snap.type,
      pendingSyncCount,
    }),
    [snap.isOnline, snap.type, pendingSyncCount],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/**
 * Access the offline state. Throws outside <OfflineProvider>.
 *
 * This is the hook the shell's OfflineBanner seam expects: it returns
 * { isOnline, pendingSyncCount } (a superset — connectionType is extra). The
 * banner can import this directly to replace its temporary local fallback.
 */
export function useConnectivity(): OfflineContextValue {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error('useConnectivity must be used within an <OfflineProvider>');
  }
  return ctx;
}

/**
 * Non-throwing variant for components that may render before/outside the provider
 * (e.g. during the auth loading gate). Falls back to "online, nothing pending" so
 * the shell degrades gracefully instead of crashing.
 */
export function useConnectivityOptional(): OfflineContextValue {
  return (
    useContext(OfflineContext) ?? { isOnline: true, connectionType: 'unknown', pendingSyncCount: 0 }
  );
}
