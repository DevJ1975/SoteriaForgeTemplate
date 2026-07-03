/**
 * useEnrollments — the signed-in learner's OWN enrollments (their real assigned
 * training + server-computed progress).
 *
 * This is the honest data source for the Home KPIs and the "Assigned to me"
 * course grouping: `enrollments.progress` is written by the server trigger from
 * actual completion statements (an INTEGER PERCENT 0–100 — see dataClient), so
 * numbers derived here reflect what the worker has genuinely done, never a
 * static authoring-time score.
 *
 * TENANT ISOLATION (the #1 rule): the read goes through the tenant-scoped data
 * client with NO tenant_id filter — Postgres RLS constrains every row to the
 * caller's own tenant, and the user_id narrowing (from the VERIFIED session,
 * never input) selects the caller's own enrollments (workers are owner-pinned
 * by policy regardless). Identity comes only from `useAuth`.
 */
import { useCallback, useEffect, useState } from 'react';
import type { EnrollmentRecord } from '@soteria-forge/shared';
import { useAuth } from '../auth/AuthProvider';
import { getDataClient, BackendNotConfiguredError } from './dataClient';

export interface UseEnrollmentsResult {
  enrollments: EnrollmentRecord[];
  loading: boolean;
  /** Set when the backend isn't wired yet — screens render an explanatory state. */
  backendPending: boolean;
  error: string | null;
  refetch: () => void;
}

export function useEnrollments(): UseEnrollmentsResult {
  const { user } = useAuth();
  const userId = user?.userId;
  const tenantId = user?.tenantId;
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // No verified identity → nothing to read (the redirect guard handles routing).
    if (!userId || !tenantId) {
      setEnrollments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setBackendPending(false);
    try {
      const client = getDataClient(tenantId);
      setEnrollments(await client.listEnrollmentsForUser(userId));
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        setBackendPending(true);
        setEnrollments([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load enrollments');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(), [load]);

  return { enrollments, loading, backendPending, error, refetch };
}
