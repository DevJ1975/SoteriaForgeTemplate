/**
 * Offline layer barrel — the public surface of the offline-first data layer.
 *
 * The rest of the app imports offline capabilities from here:
 *   - OfflineProvider / useConnectivity — lifecycle + connectivity/queue state.
 *   - completionQueue — append-only enqueue of xAPI completion statements.
 *   - syncEngine — background, idempotent outbox drain.
 *   - localCourseStore — read/hydrate the cached catalog as CourseRecords.
 *   - connectivity — the low-level NetInfo service (for non-React consumers).
 *   - VideoDownloader — offline video download/encrypt/playback orchestration.
 */

// Lifecycle + connectivity context
export {
  OfflineProvider,
  useConnectivity,
  useConnectivityOptional,
} from './OfflineProvider';
export type { OfflineContextValue } from './OfflineProvider';

// Connectivity service + hook
export { connectivity, useConnectivitySnapshot } from './netinfo';
export type { ConnectivitySnapshot } from './netinfo';

// Append-only completion-statement queue
export {
  CompletionQueue,
  toCompletionRow,
  REJECTED_MARKER,
  COMPLETION_VERB_IDS,
} from './queue';
export type { EnqueueCompletionInput, CompletionRowFields } from './queue';

// Sync engine (idempotent, backoff, never drops the queue)
export {
  SyncEngine,
  backoffDelayMs,
  decideNext,
  DEFAULT_BACKOFF,
} from './sync';
export type {
  StatementUploader,
  UploadContext,
  UploadOutcome,
  RetryDecision,
  BackoffPolicy,
  SyncResult,
  CurrentUserIdProvider,
  ConnectivityLike,
  SyncEngineDeps,
} from './sync';

// Supabase transport (the one place a queued statement meets the network)
export { supabaseUploader, currentAuthUserId } from './transport';

// App-wide singletons: node-safe logic bound to the native runtime deps
export { completionQueue, syncEngine } from './singletons';

// Local catalog read/hydrate (course list + full course-tree snapshots)
export {
  localCourseStore,
  LocalCourseStore,
  courseModelToRecord,
  enrollmentModelToRecord,
} from './localStore';
export type { CachedCourseTree, CourseTreeHydrationInput } from './localStore';

// Per-lesson quiz scratch state (resume + idempotent re-submit)
export { quizStateStore, QuizStateStore } from './quizStore';
export type { QuizStateSnapshot, QuizIdentity } from './quizStore';

// Offline video download scaffold
export { VideoDownloader } from './video';
export type {
  FileSystem,
  SecureKeyStore,
  DownloadUrlResolver,
  VideoDownloadDeps,
} from './video';
