/**
 * OutboxProvider — wires the durable completion outbox + sync engine to the
 * verified session and the browser's connectivity, and exposes a small React
 * contract the learning surfaces use to RECORD completions and REFLECT them
 * instantly (before the network confirms).
 *
 * RESPONSIBILITIES:
 *   - Own the app-wide `WebSyncEngine`, bound to the outbox singleton, the
 *     Supabase transport, the identity-fence user-id provider, and a live
 *     connectivity getter driven by `useOnlineStatus`.
 *   - Drain on RECONNECT (offline→online transition) and AFTER EACH enqueue, so
 *     a completion recorded online syncs promptly and one recorded offline syncs
 *     the moment connectivity returns.
 *   - Expose `recordCompletion` — the ONLY completion path for this surface. It
 *     injects tenantId/userId/actor from the VERIFIED session (`useAuth`), never
 *     from any component input, mirroring mobile's LessonPlayer/QuizPlayer.
 *   - Track `pendingSyncCount` (the sync indicator) and a `completionVersion`
 *     counter that bumps on every enqueue/drain so screens re-read the local
 *     outbox's `completedLessonIds` without polling.
 *
 * TENANT ISOLATION: this provider never sends or trusts a client-chosen
 * tenant_id. `tenantId` comes only from `user.tenantId` (the caller's profile),
 * and the server BEFORE INSERT trigger re-stamps it from the session regardless.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  XapiObject,
  XapiResult,
  XapiVerb,
} from '@soteria-forge/shared'
import { useAuth } from '../auth'
import { useOnlineStatus } from '../pwa/useOnlineStatus'
import { completionOutbox } from './outbox'
import { WebSyncEngine } from './sync'
import { currentAuthUserId, supabaseUploader } from './transport'

/** The semantic parts a lesson surface supplies; identity is injected by the provider. */
export interface RecordCompletionInput {
  /** Optional client UUID to reuse for idempotency (e.g. a quiz re-submit / retry). */
  id?: string
  verb: XapiVerb
  object: XapiObject
  result?: XapiResult
  /** EXACTLY the shape the server progress trigger reads. */
  context: { course_id: string; lesson_id: string }
}

interface OutboxContextValue {
  /** Coarse browser connectivity (soft hint; fetch errors are authoritative). */
  isOnline: boolean
  /** Count of records still awaiting upload — drives the sync indicator. */
  pendingSyncCount: number
  /** Bumps on every enqueue/drain so consumers re-read `completedLessonIds`. */
  completionVersion: number
  /** Append a completion to the outbox (identity from the verified session). */
  recordCompletion: (input: RecordCompletionInput) => Promise<void>
  /** The current learner's locally-completed lesson ids for a course (append-only outbox). */
  getCompletedLessonIds: (courseId: string) => Promise<Set<string>>
}

const OutboxContext = createContext<OutboxContextValue | null>(null)

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()

  const [pendingSyncCount, setPendingSyncCount] = useState(0)
  const [completionVersion, setCompletionVersion] = useState(0)

  // A ref mirror of the latest online status so the engine's connectivity getter
  // always reads the CURRENT value (the engine is created once; `isOnline` here
  // changes on every transition).
  const onlineRef = useRef(isOnline)
  onlineRef.current = isOnline

  const bumpVersion = useCallback(() => setCompletionVersion((v) => v + 1), [])

  const refreshPendingCount = useCallback(() => {
    completionOutbox
      .pendingCount()
      .then(setPendingSyncCount)
      .catch(() => {
        /* IndexedDB unavailable — leave the last known count, never crash the UI. */
      })
  }, [])

  // One engine for the surface's lifetime. `onChange` refreshes the badge + bumps
  // the version whenever a drain mutated a record (synced / rejected).
  const engine = useMemo(
    () =>
      new WebSyncEngine({
        outbox: completionOutbox,
        uploader: supabaseUploader,
        currentUserId: currentAuthUserId,
        isOnline: () => onlineRef.current,
        onChange: () => {
          refreshPendingCount()
          bumpVersion()
        },
      }),
    [refreshPendingCount, bumpVersion],
  )

  // Initial + user-change count read, and drain any already-pending work if we
  // boot online with a signed-in learner (e.g. records left from a prior session
  // on this device that belong to this same user).
  useEffect(() => {
    refreshPendingCount()
    if (user && onlineRef.current) void engine.syncNow()
  }, [user, engine, refreshPendingCount])

  // Drain on the offline→online transition. `useOnlineStatus` re-renders on every
  // change; we trigger a drain whenever we are (now) online and signed in.
  useEffect(() => {
    if (isOnline && user) void engine.syncNow()
  }, [isOnline, user, engine])

  // Cancel any armed retry on unmount.
  useEffect(() => () => engine.stop(), [engine])

  const recordCompletion = useCallback(
    async (input: RecordCompletionInput) => {
      // Identity MUST come from the verified session, never component input.
      if (!user) {
        throw new Error('Your session expired. Sign in again to record completion.')
      }
      const actorName = user.displayName ?? user.email ?? user.id
      await completionOutbox.enqueue({
        id: input.id,
        // tenantId + userId come ONLY from the verified session profile.
        tenantId: user.tenantId,
        userId: user.id,
        actor: { name: actorName },
        verb: input.verb,
        object: input.object,
        result: input.result,
        context: input.context,
      })
      // Reflect immediately (optimistic), then push to the server if online.
      bumpVersion()
      refreshPendingCount()
      if (onlineRef.current) void engine.syncNow()
    },
    [user, engine, bumpVersion, refreshPendingCount],
  )

  const getCompletedLessonIds = useCallback(
    async (courseId: string) => {
      if (!user) return new Set<string>()
      return completionOutbox.completedLessonIds(user.id, courseId)
    },
    [user],
  )

  const value = useMemo<OutboxContextValue>(
    () => ({
      isOnline,
      pendingSyncCount,
      completionVersion,
      recordCompletion,
      getCompletedLessonIds,
    }),
    [isOnline, pendingSyncCount, completionVersion, recordCompletion, getCompletedLessonIds],
  )

  return <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>
}

/** Access the outbox contract. Throws outside <OutboxProvider>. */
export function useOutbox(): OutboxContextValue {
  const ctx = useContext(OutboxContext)
  if (!ctx) {
    throw new Error('useOutbox must be used within an <OutboxProvider>')
  }
  return ctx
}
