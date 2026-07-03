/**
 * Supabase transport for the sync engine — the ONE place a queued xAPI
 * statement meets the network.
 *
 * Split out of sync.ts so the engine itself stays node-safe (unit-testable
 * without a React Native runtime): this module imports `../supabase`, which
 * drags in react-native / expo-constants and can only load in the app.
 */
import { supabase, isSupabaseConfigured } from '../supabase';
import type { Json, TablesInsert } from '@soteria-forge/shared/supabase';
import type { StatementUploader, UploadOutcome, CurrentUserIdProvider } from './sync';

/**
 * Classify a PostgREST error code into a retry outcome.
 *
 * Auth/RLS refusals (permission denied, RLS violation) are permanent → 'rejected'.
 * Everything else (network already handled by the throw path, transient 5xx) is
 * treated as retryable so the durable queue simply drains later.
 */
function outcomeForPostgrestCode(code: string | undefined): UploadOutcome {
  // 42501 = insufficient_privilege, 42P17 = RLS recursion; PGRST301 = JWT/permission.
  if (code === '42501' || code === '42P17' || code === 'PGRST301') return 'rejected';
  return 'retryable';
}

/**
 * The default transport: upsert into `completion_statements`, ignoring duplicates
 * by the client UUID. Append-only + idempotent, exactly as the queue guarantees.
 *
 * The write is idempotent by `statement.id` (the table's primary key + the
 * upsert's conflict target), so re-sending is always safe. TENANT ISOLATION is
 * enforced by Postgres, not here: a BEFORE INSERT trigger stamps `tenant_id` from
 * the caller's verified auth context, and there is no update/delete policy, so a
 * client cannot choose another tenant's id or mutate an existing row. We send
 * `tenant_id`/`user_id` only because the column shape requires them; the server
 * overrides `tenant_id` from the session regardless of what we pass — the client
 * NEVER chooses the tenant.
 */
export const supabaseUploader: StatementUploader = async (statement, ctx) => {
  if (!isSupabaseConfigured) {
    // No configured backend → treat as retryable so the outbox accumulates and
    // drains once credentials exist, just like being offline.
    return 'retryable';
  }

  // The xAPI actor/verb/object/result/context are plain JSON-serializable values;
  // they land in `jsonb` columns typed as `Json`. Cast at this single boundary so
  // the structured xAPI types meet the generated column type cleanly.
  const row: TablesInsert<'completion_statements'> = {
    id: statement.id, // client UUID = idempotency key = primary key
    // tenant_id is re-stamped server-side from the auth context by a BEFORE
    // INSERT trigger; we pass the statement's own tenantId (itself derived from
    // the verified profile) only to satisfy the column shape.
    tenant_id: statement.tenantId,
    user_id: ctx.userId,
    actor: statement.actor as Json,
    verb: statement.verb as Json,
    object: statement.object as Json,
    result: (statement.result ?? null) as Json | null,
    context: (statement.context ?? null) as Json | null,
    // `timestamp` is the xAPI ACTIVITY time; the table stores it as occurred_at.
    occurred_at: statement.timestamp,
  };

  const { error } = await supabase
    .from('completion_statements')
    .upsert([row], { onConflict: 'id', ignoreDuplicates: true });

  if (!error) return 'acked';
  return outcomeForPostgrestCode(error.code);
};

/**
 * Resolve the CURRENT verified auth user id from the locally persisted Supabase
 * session (no network round-trip). Returns null when there is no session (or no
 * configured backend) — in which case the engine uploads NOTHING: a statement
 * may only ever be sent under the identity that authored it.
 */
export const currentAuthUserId: CurrentUserIdProvider = async () => {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
};
