/**
 * WatermelonDB schema migrations.
 *
 * When SCHEMA_VERSION in schema.ts is bumped, add a `{ toVersion, steps: [...] }`
 * entry here describing the forward migration (addColumns / createTable / etc.).
 * WatermelonDB applies these in order to bring an installed device's on-disk DB
 * up to the code's version WITHOUT wiping the append-only completion_statements
 * outbox — losing that queue would drop a worker's offline completions, which
 * must never happen.
 */
import {
  addColumns,
  createTable,
  schemaMigrations,
} from '@nozbe/watermelondb/Schema/migrations';
import { Tables } from './schema';

export const migrations = schemaMigrations({
  migrations: [
    // v2 — offline course-taking: cache authored lesson content locally and
    // snapshot the caller's own enrollments, so a course opens (and a quiz
    // renders + scores) with no connectivity. Purely additive: no existing
    // column changes, and the completion_statements outbox is untouched.
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: Tables.lessons,
          columns: [{ name: 'content_json', type: 'string', isOptional: true }],
        }),
        createTable({
          name: Tables.enrollments,
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'tenant_id', type: 'string', isIndexed: true },
            { name: 'user_id', type: 'string', isIndexed: true },
            { name: 'course_id', type: 'string', isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'progress', type: 'number' },
            { name: 'due_at', type: 'string', isOptional: true },
            { name: 'completed_at', type: 'string', isOptional: true },
            { name: 'server_created_at', type: 'string' },
            { name: 'downloaded_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
