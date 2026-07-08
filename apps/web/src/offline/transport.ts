/**
 * Supabase transport for the web sync engine — the ONE place a queued xAPI
 * statement meets the network.
 *
 * This is a FAITHFUL MIRROR of `apps/mobile/src/offline/transport.ts`: it writes
 * the IDENTICAL `completion_statements` row shape via the IDENTICAL idempotent
 * upsert, so the web and mobile clients produce byte-compatible rows and the
 * migration-12 progress trigger counts a web completion exactly as it counts a
 * mobile one. Split out of `./sync.ts` so the engine stays pure and testable.
 *
 * TENANT ISOLATION (the #1 rule) is enforced by Postgres, NOT here: a BEFORE
 * INSERT trigger stamps `tenant_id` from the caller's verified auth context
 * (`auth.uid()`), and there is no UPDATE/DELETE policy, so a client can neither
 * choose another tenant's id nor mutate a stored row. We send `tenant_id` only
 * to satisfy the non-nullable column shape of `TablesInsert<'completion_statements'>`;
 * its value is the statement's own `tenantId`, itself derived from the verified
 * profile (never request input), and the trigger OVERRIDES it from the session
 * regardless — the client NEVER chooses the tenant. This is exactly mobile's
 * ServerStamped discipline.
 */
import { supabase, isSupabaseConfigured } from '../supabase'
import type { Json, TablesInsert } from '@soteria-forge/shared/supabase'
import type { XapiStatement } from '@soteria-forge/shared'

/**
 * Result of attempting to upload one statement.
 *   - 'acked'     — server accepted it (first insert OR idempotent no-op on an
 *                   already-stored UUID). Either way: mark synced.
 *   - 'retryable' — transient failure (offline, 5xx, timeout, network). Keep the
 *                   record, back off, try again.
 *   - 'rejected'  — permanent failure (RLS refusal, malformed payload the server
 *                   will NEVER accept). Keep the record but stop auto-retrying;
 *                   surface for inspection. Rare — a well-formed statement from
 *                   the caller's own tenant is never rejected.
 */
export type UploadOutcome = 'acked' | 'retryable' | 'rejected'

/** Uploads one statement; `userId` is the local indexing column (the signed-in learner). */
export type StatementUploader = (
  statement: XapiStatement,
  userId: string,
) => Promise<UploadOutcome>

/** Resolves the CURRENT verified session user id — the engine's identity fence. */
export type CurrentUserIdProvider = () => Promise<string | null>

/**
 * Classify a PostgREST error code into a retry outcome. Identical policy to
 * mobile: auth/RLS refusals are permanent → 'rejected'; everything else is
 * treated as retryable so the durable outbox simply drains later.
 */
function outcomeForPostgrestCode(code: string | undefined): UploadOutcome {
  // 42501 = insufficient_privilege, 42P17 = RLS recursion; PGRST301 = JWT/permission.
  if (code === '42501' || code === '42P17' || code === 'PGRST301') return 'rejected'
  return 'retryable'
}

/**
 * The default transport: upsert into `completion_statements`, ignoring duplicates
 * by the client UUID. Append-only + idempotent, EXACTLY as mobile does:
 * `upsert([row], { onConflict: 'id', ignoreDuplicates: true })`.
 */
export const supabaseUploader: StatementUploader = async (statement, userId) => {
  if (!isSupabaseConfigured) {
    // No configured backend → treat as retryable so the outbox accumulates and
    // drains once credentials exist, just like being offline.
    return 'retryable'
  }

  // The xAPI actor/verb/object/result/context are plain JSON-serializable values;
  // they land in `jsonb` columns typed as `Json`. Cast at this single boundary so
  // the structured xAPI types meet the generated column type cleanly — mirroring
  // mobile's transport row exactly.
  const row: TablesInsert<'completion_statements'> = {
    id: statement.id, // client UUID = idempotency key = primary key
    // tenant_id is re-stamped server-side from the auth context by a BEFORE
    // INSERT trigger; we pass the statement's own tenantId (itself derived from
    // the verified profile) only to satisfy the non-nullable column shape.
    tenant_id: statement.tenantId,
    user_id: userId,
    actor: statement.actor as Json,
    verb: statement.verb as Json,
    object: statement.object as Json,
    result: (statement.result ?? null) as Json | null,
    context: (statement.context ?? null) as Json | null,
    // `timestamp` is the xAPI ACTIVITY time; the table stores it as occurred_at.
    occurred_at: statement.timestamp,
  }

  const { error } = await supabase
    .from('completion_statements')
    .upsert([row], { onConflict: 'id', ignoreDuplicates: true })

  if (!error) return 'acked'
  return outcomeForPostgrestCode(error.code)
}

/**
 * Resolve the CURRENT verified auth user id from the locally persisted Supabase
 * session (no network round-trip). Returns null when there is no session (or no
 * configured backend) — in which case the engine uploads NOTHING: a statement
 * may only ever be sent under the identity that authored it. Mirrors mobile's
 * `currentAuthUserId`.
 */
export const currentAuthUserId: CurrentUserIdProvider = async () => {
  if (!isSupabaseConfigured) return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}
