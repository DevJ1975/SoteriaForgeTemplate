/**
 * CompletionStatementModel — one row of the APPEND-ONLY xAPI outbox.
 *
 * IMMUTABILITY CONTRACT:
 *   Every field except `synced` / `syncedAt` / the attempt-bookkeeping columns is
 *   written exactly once, at enqueue time, and never changed. `statementId` is
 *   the CLIENT-GENERATED UUID and the idempotency key: the server dedupes on it,
 *   so re-POSTing the same row is a guaranteed no-op. Because rows are immutable
 *   and keyed by a stable UUID, two devices (or one device retrying) can never
 *   disagree about a statement — which is precisely why there is NO conflict
 *   resolution anywhere in the sync path.
 *
 * The `synced` flag and attempt counters are local sync bookkeeping only; they
 * are never sent to the server and do not affect the statement's identity.
 */
import { Model } from '@nozbe/watermelondb';
import { field, text, readonly } from '@nozbe/watermelondb/decorators';
import type { XapiStatement } from '@soteria-forge/shared';
import { Tables } from '../schema';

export class CompletionStatementModel extends Model {
  static table = Tables.completionStatements;

  // --- Immutable, written once at enqueue (readonly = never re-written) ---
  @readonly @text('statement_id') statementId!: string;
  @readonly @text('tenant_id') tenantId!: string;
  @readonly @text('user_id') userId!: string;
  @readonly @text('verb') verb!: string;
  @readonly @text('object_id') objectId!: string;
  @readonly @text('statement_json') statementJson!: string;
  @readonly @text('result_json') resultJson?: string;
  @readonly @text('timestamp') timestamp!: string;
  @readonly @field('enqueued_at') enqueuedAt!: number;

  // --- Mutable sync bookkeeping (never sent to the server) ---
  @field('synced') synced!: boolean;
  @field('synced_at') syncedAt?: number;
  @field('attempt_count') attemptCount!: number;
  @field('last_attempt_at') lastAttemptAt?: number;
  @text('last_error') lastError?: string;

  /**
   * The full canonical xAPI statement to POST. Parsed from the immutable JSON
   * column — this, not the denormalized columns, is authoritative. Throws if the
   * stored JSON is corrupt, which is a hard bug (we wrote it), not a runtime
   * degrade case, so it must surface loudly rather than silently drop a statement.
   */
  get statement(): XapiStatement {
    return JSON.parse(this.statementJson) as XapiStatement;
  }
}
