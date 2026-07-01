/**
 * Connectivity service — the single source of truth for "are we online?".
 *
 * Wraps @react-native-community/netinfo in a tiny observable so the rest of the
 * offline layer (and the UI) subscribes to ONE connectivity signal instead of
 * each holding its own NetInfo listener. The signal drives the local-only vs.
 * sync decision:
 *
 *   - offline → the app reads/writes ONLY the local WatermelonDB store; the sync
 *     engine parks. The UI is never blocked on the network.
 *   - online  → the sync engine drains the append-only outbox (idempotently).
 *
 * "Online" here means reachable, not merely "has an interface": we require
 * `isConnected` AND `isInternetReachable !== false`. NetInfo reports
 * `isInternetReachable` as null while it is still probing; we treat null as
 * optimistically online so a slow probe never wedges a device that actually has
 * connectivity. A hard `false` (captive portal, no route) is treated as offline.
 */
import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface ConnectivitySnapshot {
  isOnline: boolean;
  /** Raw NetInfo connection type (wifi/cellular/none/…) for display/telemetry. */
  type: string;
}

type Listener = (snap: ConnectivitySnapshot) => void;

/** Derive our online boolean from a raw NetInfo state (see module doc). */
function deriveOnline(state: NetInfoState): boolean {
  if (!state.isConnected) return false;
  // null = still probing → optimistically online; false = confirmed unreachable.
  return state.isInternetReachable !== false;
}

function toSnapshot(state: NetInfoState): ConnectivitySnapshot {
  return { isOnline: deriveOnline(state), type: state.type };
}

/**
 * Process-wide connectivity singleton. One NetInfo subscription, fanned out to
 * many listeners. The sync engine and the UI both attach here.
 */
class ConnectivityService {
  private snapshot: ConnectivitySnapshot = { isOnline: true, type: 'unknown' };
  private listeners = new Set<Listener>();
  private unsubscribeNetInfo: (() => void) | null = null;

  /** Begin observing NetInfo. Idempotent — safe to call from OfflineProvider mount. */
  start(): void {
    if (this.unsubscribeNetInfo) return;
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      this.set(toSnapshot(state));
    });
    // Prime with the current state so subscribers don't wait for the first change.
    void NetInfo.fetch().then((state) => this.set(toSnapshot(state)));
  }

  /** Tear down the NetInfo subscription (OfflineProvider unmount / sign-out). */
  stop(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
  }

  get current(): ConnectivitySnapshot {
    return this.snapshot;
  }

  get isOnline(): boolean {
    return this.snapshot.isOnline;
  }

  /** Subscribe to connectivity changes. Returns an unsubscribe fn. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately so late subscribers are consistent.
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  private set(next: ConnectivitySnapshot): void {
    const changed =
      next.isOnline !== this.snapshot.isOnline || next.type !== this.snapshot.type;
    this.snapshot = next;
    if (changed) {
      for (const l of this.listeners) l(next);
    }
  }
}

/** The one connectivity service instance. */
export const connectivity = new ConnectivityService();

/**
 * React hook: subscribe a component to connectivity changes. Re-renders only
 * when the online flag or connection type actually changes.
 */
export function useConnectivitySnapshot(): ConnectivitySnapshot {
  const [snap, setSnap] = useState<ConnectivitySnapshot>(() => connectivity.current);
  useEffect(() => connectivity.subscribe(setSnap), []);
  return snap;
}
