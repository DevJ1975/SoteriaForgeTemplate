/**
 * useCourses — tenant-scoped course list hook, now offline-aware.
 *
 * Binds to the VERIFIED tenantId (from the token, via useAuth) and returns the
 * standard {courses, loading, backendPending, error, refetch} shape the screens
 * consume. That contract is UNCHANGED — CourseList did not need to be touched.
 *
 * SOURCE SELECTION (the offline seam, now filled):
 *   - ONLINE:  read from AppSync via `getDataClient`, then HYDRATE the local
 *     WatermelonDB cache so the next offline session has fresh data. If the
 *     network read fails, fall back to whatever is cached locally rather than
 *     erroring — a flaky connection must never blank the list.
 *   - OFFLINE: read straight from the local store (`localCourseStore`). The local
 *     store is the source of truth until sync; the UI is NEVER blocked on network.
 *
 * TENANT ISOLATION: both paths are scoped by the same token-derived tenantId.
 * `getDataClient(tenantId)` has no unscoped query, and the local store filters on
 * tenant_id — so neither online nor offline can surface another tenant's courses.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CourseRecord } from '@soteria-forge/shared';
import { useTenantId } from '../auth/AuthProvider';
import { useConnectivityOptional, localCourseStore } from '../offline';
import { getDataClient, BackendNotConfiguredError } from './dataClient';

export interface UseCoursesResult {
  courses: CourseRecord[];
  loading: boolean;
  /** Set when the backend isn't wired yet — screens render an explanatory empty state. */
  backendPending: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCourses(): UseCoursesResult {
  const tenantId = useTenantId();
  const { isOnline } = useConnectivityOptional();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBackendPending(false);

    // OFFLINE: local store is the source of truth. Never hit the network.
    if (!isOnline) {
      try {
        setCourses(await localCourseStore.listCourses(tenantId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read offline courses');
      } finally {
        setLoading(false);
      }
      return;
    }

    // ONLINE: read from AppSync, hydrate the cache, and show the fresh list.
    try {
      const client = getDataClient(tenantId);
      const data = await client.listCourses();
      setCourses(data);
      // Best-effort cache refresh for the next offline session — never block the
      // UI on it, and a hydrate failure must not surface as a load error.
      void localCourseStore.hydrateCourses(tenantId, data).catch(() => {});
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        // Backend not deployed yet: fall back to any cached courses so a device
        // that synced earlier still shows its catalog. Only show the
        // "backend not deployed" empty state when the cache is also empty.
        try {
          const cached = await localCourseStore.listCourses(tenantId);
          setCourses(cached);
          setBackendPending(cached.length === 0);
        } catch {
          setBackendPending(true);
          setCourses([]);
        }
      } else {
        // Transient network failure while online: fall back to the local cache
        // instead of blanking the list; only surface an error if nothing cached.
        try {
          const cached = await localCourseStore.listCourses(tenantId);
          if (cached.length > 0) {
            setCourses(cached);
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load courses');
          }
        } catch {
          setError(err instanceof Error ? err.message : 'Failed to load courses');
        }
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, isOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  return { courses, loading, backendPending, error, refetch: () => void load() };
}
