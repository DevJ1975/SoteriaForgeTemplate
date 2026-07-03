/**
 * In-memory fake of the WatermelonDB surface the offline layer touches. It
 * interprets REAL `Q` clause objects (their serialized public shape:
 * `{type:'where', left, comparison:{operator, right:{value}}}`, `Q.or`,
 * `Q.sortBy`) so the PRODUCTION query code paths — `uploadableClauses()`,
 * `pending()`, `pendingCount()`, `completedLessonIds()`, `enqueue()`'s
 * idempotency lookup — execute UNMODIFIED against plain in-memory rows.
 *
 * SQL semantics are preserved where they matter: `notEq` EXCLUDES NULL values
 * (SQLite three-valued logic: `NULL != 'x'` is not true), which is exactly why
 * `uploadableClauses()` needs its explicit
 * `last_error IS NULL OR last_error != 'rejected'` disjunction — a fake with
 * JS `!==` semantics would hide that bug class.
 *
 * NOT a test file itself — a helper imported by queue.test.ts / sync.test.ts.
 */
import type { Database } from '@nozbe/watermelondb';
import type { XapiStatement } from '@soteria-forge/shared';

/** Mirror of CompletionStatementModel's fields + the two methods the code uses. */
export class FakeCompletionRow {
  statementId!: string;
  tenantId!: string;
  userId!: string;
  verb!: string;
  objectId!: string;
  statementJson!: string;
  resultJson?: string;
  timestamp!: string;
  synced!: boolean;
  syncedAt?: number;
  attemptCount!: number;
  lastAttemptAt?: number;
  lastError?: string;
  enqueuedAt!: number;

  /** Same contract as the real model: parses (and can throw on corrupt JSON). */
  get statement(): XapiStatement {
    return JSON.parse(this.statementJson) as XapiStatement;
  }

  /** The real model's update() applies the mutator to itself. */
  async update(fn: (row: this) => void): Promise<this> {
    fn(this);
    return this;
  }
}

/** WatermelonDB column name (snake_case) → fake model property (camelCase). */
function columnToProp(column: string): string {
  return column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Minimal structural types for the serialized Q clauses we interpret.
interface WhereClause {
  type: 'where';
  left: string;
  comparison: { operator: string; right: { value: unknown } };
}
interface OrClause {
  type: 'or';
  conditions: AnyClause[];
}
interface AndClause {
  type: 'and';
  conditions: AnyClause[];
}
interface SortByClause {
  type: 'sortBy';
  sortColumn: string;
  sortOrder: 'asc' | 'desc';
}
type AnyClause = WhereClause | OrClause | AndClause | SortByClause;

function matches(row: FakeCompletionRow, clause: AnyClause): boolean {
  switch (clause.type) {
    case 'where': {
      const raw = (row as unknown as Record<string, unknown>)[columnToProp(clause.left)];
      // WatermelonDB stores absent optionals as NULL; our fakes use undefined.
      const value = raw === undefined ? null : raw;
      const target = clause.comparison.right.value;
      switch (clause.comparison.operator) {
        case 'eq':
          return value === target;
        case 'notEq':
          // SQL three-valued logic: NULL != x is NOT true → NULL rows excluded.
          return value !== null && value !== target;
        default:
          throw new Error(`fakeDb: unsupported operator ${clause.comparison.operator}`);
      }
    }
    case 'or':
      return clause.conditions.some((c) => matches(row, c));
    case 'and':
      return clause.conditions.every((c) => matches(row, c));
    case 'sortBy':
      return true; // handled separately
    default:
      throw new Error(`fakeDb: unsupported clause ${(clause as { type: string }).type}`);
  }
}

export class FakeCollection {
  rows: FakeCompletionRow[] = [];

  query(...clauses: unknown[]) {
    const typed = clauses as AnyClause[];
    const filters = typed.filter((c) => c.type !== 'sortBy');
    const sorts = typed.filter((c): c is SortByClause => c.type === 'sortBy');

    const run = () => {
      let out = this.rows.filter((row) => filters.every((c) => matches(row, c)));
      for (const s of sorts) {
        const prop = columnToProp(s.sortColumn);
        const dir = s.sortOrder === 'desc' ? -1 : 1;
        out = [...out].sort((a, b) => {
          const av = (a as unknown as Record<string, number>)[prop] ?? 0;
          const bv = (b as unknown as Record<string, number>)[prop] ?? 0;
          return av < bv ? -dir : av > bv ? dir : 0;
        });
      }
      return out;
    };

    return {
      fetch: async () => run(),
      fetchCount: async () => run().length,
    };
  }

  async create(builder: (row: FakeCompletionRow) => void): Promise<FakeCompletionRow> {
    const row = new FakeCompletionRow();
    builder(row);
    this.rows.push(row);
    return row;
  }
}

/** A fake Database: one collection, `write()` just runs the work function. */
export function makeFakeDb(): { db: Database; collection: FakeCollection } {
  const collection = new FakeCollection();
  const db = {
    get: () => collection,
    write: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  } as unknown as Database;
  return { db, collection };
}
