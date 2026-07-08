/**
 * useTrainingRecord — the reactive read-model + retry hook behind the learner's
 * "My training record" screen (#15a).
 *
 * It surfaces, for the SIGNED-IN user, every locally-recorded completion as a
 * plain {@link CompletionRecordEntry} tagged Synced / Waiting / Needs-attention,
 * and a `retry` action for the needs-attention ones. It is intentionally
 * SEPARATE from OfflineProvider's context (which stays `{ isOnline,
 * connectionType, pendingSyncCount }` for OfflineBanner) — this is an additive
 * surface a specific screen opts into, mirroring how `useConnectivity` reads the
 * singletons.
 *
 * REACTIVITY: it subscribes to `completionQueue.observeUserRecords(userId)`,
 * which emits on every enqueue / sync / retry, and re-projects via
 * `recordEntries(userId)` — so the list updates live as statements sync in the
 * background. The store being unopenable (native SQLite module absent outside a
 * dev client) degrades to an empty, non-loading list instead of crashing.
 *
 * IDENTITY FENCE: `userId` MUST be the current verified session user id (from
 * `useAuth`). Every read is filtered by `user_id`, and `retry` refuses any
 * statementId not already in the current user's entries — the call-site fence
 * for `CompletionQueue.retry` (which itself operates purely by statementId).
 *
 * This file is a NATIVE-side hook (imports the singletons); it is NOT in the
 * node:test import graph and must never be imported by queue.ts/sync.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { completionQueue, syncEngine } from './singletons';
import type { CompletionRecordEntry } from './queue';

export interface TrainingRecordState {
  /** The signed-in user's completions, newest-first. */
  entries: CompletionRecordEntry[];
  /** True until the first projection resolves (or the store fails to open). */
  loading: boolean;
  /**
   * Re-arm a NEEDS-ATTENTION statement for upload and kick an immediate drain.
   * No-op unless the statementId belongs to the current user's record and the
   * row is still unsynced. LOCAL bookkeeping only — never mutates the server.
   */
  retry: (statementId: string) => Promise<void>;
  /** Manually re-project (rarely needed — the subscription keeps it live). */
  refresh: () => Promise<void>;
}

const EMPTY: CompletionRecordEntry[] = [];

export function useTrainingRecord(userId: string | null | undefined): TrainingRecordState {
  const [entries, setEntries] = useState<CompletionRecordEntry[]>(EMPTY);
  const [loading, setLoading] = useState(true);
  // Keep the latest entries readable inside `retry` without re-subscribing.
  const entriesRef = useRef<CompletionRecordEntry[]>(EMPTY);
  entriesRef.current = entries;

  const project = useCallback(async () => {
    if (!userId) {
      setEntries(EMPTY);
      return;
    }
    try {
      setEntries(await completionQueue.recordEntries(userId));
    } catch {
      setEntries(EMPTY);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (!userId) {
      setEntries(EMPTY);
      setLoading(false);
      return;
    }

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      subscription = completionQueue.observeUserRecords(userId).subscribe({
        // observe() emits the current set immediately on subscribe, so this also
        // covers the initial load — no separate first fetch needed.
        next: () => {
          void (async () => {
            let next: CompletionRecordEntry[] = EMPTY;
            try {
              next = await completionQueue.recordEntries(userId);
            } catch {
              next = EMPTY;
            }
            if (!cancelled) {
              setEntries(next);
              setLoading(false);
            }
          })();
        },
        error: () => {
          if (!cancelled) {
            setEntries(EMPTY);
            setLoading(false);
          }
        },
      });
    } catch {
      // Store unopenable (e.g. native module missing) → empty, not a crash.
      setEntries(EMPTY);
      setLoading(false);
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [userId]);

  const retry = useCallback(
    async (statementId: string) => {
      if (!userId) return;
      // Call-site identity fence: only retry a statement in THIS user's record.
      const owned = entriesRef.current.some((e) => e.statementId === statementId);
      if (!owned) return;
      const reArmed = await completionQueue.retry(statementId);
      // Kick an immediate drain; syncNow() is connectivity-gated + concurrency-
      // guarded, so it is a safe no-op while offline or mid-drain.
      if (reArmed) void syncEngine.syncNow();
    },
    [userId],
  );

  return { entries, loading, retry, refresh: project };
}
