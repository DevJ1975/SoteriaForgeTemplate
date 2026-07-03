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
  completionQueue,
  CompletionQueue,
  toCompletionRow,
  REJECTED_MARKER,
  COMPLETION_VERB_IDS,
} from './queue';
export type { EnqueueCompletionInput, CompletionRowFields } from './queue';

// Sync engine (idempotent, backoff, never drops the queue)
export {
  syncEngine,
  SyncEngine,
  supabaseUploader,
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
} from './sync';

// Local catalog read/hydrate
export { localCourseStore, LocalCourseStore, courseModelToRecord } from './localStore';

// Offline video download scaffold
export { VideoDownloader } from './video';
export type {
  FileSystem,
  SecureKeyStore,
  DownloadUrlResolver,
  VideoDownloadDeps,
} from './video';
