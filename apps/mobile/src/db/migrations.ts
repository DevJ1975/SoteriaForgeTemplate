/**
 * WatermelonDB schema migrations.
 *
 * Empty for v1 (initial schema). When SCHEMA_VERSION in schema.ts is bumped, add
 * a `{ toVersion, steps: [...] }` entry here describing the forward migration
 * (addColumns / createTable / etc.). WatermelonDB applies these in order to bring
 * an installed device's on-disk DB up to the code's version WITHOUT wiping the
 * append-only completion_statements outbox — losing that queue would drop a
 * worker's offline completions, which must never happen.
 */
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    // v1 is the baseline; no migrations yet.
    // Example for a future v2:
    // {
    //   toVersion: 2,
    //   steps: [addColumns({ table: 'lessons', columns: [{ name: 'foo', type: 'string', isOptional: true }] })],
    // },
  ],
});
