/**
 * WatermelonDB database singleton — SQLite-backed local store for the offline
 * learner experience.
 *
 * ADAPTER: SQLiteAdapter with JSI enabled. JSI is the fast, synchronous bridge
 * WatermelonDB uses on modern React Native (0.76 here); it requires the native
 * `@nozbe/watermelondb` module to be present in the custom dev client (it is not
 * available in Expo Go — see app.config.ts). `dbName` namespaces the on-disk
 * file; `onSetUpError` surfaces a corrupt/unopenable DB instead of failing
 * silently.
 *
 * SINGLETON: the app opens exactly one Database for its lifetime. Opening SQLite
 * twice against the same file corrupts WatermelonDB's internal caches, so this
 * module memoizes the instance and everything (OfflineProvider, queue, sync)
 * imports `database` from here.
 *
 * TENANT NOTE: this is a single-user, single-tenant device cache. We do NOT put
 * the tenantId in `dbName` — the signed-in user only ever has one tenant (from
 * the token claim), and rows carry `tenant_id` for defense in depth. If the app
 * ever supported switching identities on one device, the store would be reset on
 * sign-out (see resetDatabase) rather than partitioned by name.
 */
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { migrations } from './migrations';
import { modelClasses } from './models';

/** On-disk SQLite filename (WatermelonDB appends its own extension). */
const DB_NAME = 'soteria_forge_offline';

function createDatabase(): Database {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: DB_NAME,
    // JSI = synchronous native bridge; the default async path also works but JSI
    // is the recommended, faster mode on new-architecture React Native.
    jsi: true,
    onSetUpError: (error) => {
      // A DB that cannot be opened (corruption, failed migration) is fatal to the
      // offline layer — log loudly so it is not swallowed. The OfflineProvider
      // treats an unopened DB as "offline store unavailable" and the UI still
      // renders (network-only) rather than crashing.
      // eslint-disable-next-line no-console
      console.error('[offline/db] Failed to set up WatermelonDB adapter:', error);
    },
  });

  return new Database({ adapter, modelClasses });
}

let instance: Database | null = null;

/** The one Database instance for the app's lifetime, created on first use. */
export function getDatabase(): Database {
  if (!instance) instance = createDatabase();
  return instance;
}

/**
 * Lazy singleton facade. The offline singletons (queue, sync, local store) are
 * constructed at module scope on the app's boot path, so if the adapter were
 * built eagerly here, a native-init failure (missing/broken WatermelonDB module
 * in the dev client) would crash the app at IMPORT time — before any screen
 * renders. This Proxy keeps the `database` export and its API intact while
 * deferring adapter construction to first actual USE. On a failed native init
 * that first use is the sync engine's initial `syncNow()` drain, where the
 * throw surfaces as a rejected promise (a LogBox warning, not a boot crash),
 * and the OfflineProvider's guarded pending-count effect then degrades the UI
 * to "offline store unavailable".
 */
export const database: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const db = getDatabase();
    const value = Reflect.get(db as object, prop, db);
    return typeof value === 'function' ? value.bind(db) : value;
  },
  set(_target, prop, value) {
    Reflect.set(getDatabase() as object, prop, value);
    return true;
  },
  has(_target, prop) {
    return Reflect.has(getDatabase() as object, prop);
  },
});

/**
 * Wipe the local store. Called on sign-out so a device never retains one
 * identity's cached tenant data after a different user signs in. This unsafely
 * resets ALL tables including the completion_statements outbox, so it must only
 * be called when that queue is known-empty (fully synced) or intentionally
 * discarded — the OfflineProvider drains sync before invoking it.
 */
export async function resetDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

export { schema } from './schema';
export { Tables } from './schema';
export type { TableName } from './schema';
export * from './models';
