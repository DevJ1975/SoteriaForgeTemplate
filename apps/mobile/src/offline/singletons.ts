/**
 * App-wide offline singletons — the ONE place the node-safe offline logic
 * (queue.ts, sync.ts) is bound to the app's native runtime dependencies:
 * the SQLite-backed WatermelonDB singleton, the NetInfo connectivity service,
 * and the Supabase transport.
 *
 * Everything above this module is dependency-injected and unit-testable under
 * plain Node; everything imported here needs the React Native runtime.
 */
import { database } from '../db';
import { connectivity } from './netinfo';
import { CompletionQueue } from './queue';
import { SyncEngine } from './sync';
import { supabaseUploader, currentAuthUserId } from './transport';

/** App-wide queue bound to the singleton database. */
export const completionQueue = new CompletionQueue(database);

/** App-wide sync engine bound to the singleton DB + the Supabase transport. */
export const syncEngine = new SyncEngine({
  uploader: supabaseUploader,
  db: database,
  currentUserId: currentAuthUserId,
  connectivity,
});
