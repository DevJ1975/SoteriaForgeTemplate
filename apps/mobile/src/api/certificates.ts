/**
 * useCertificates / useCertificate — the learner's OWN earned certificates.
 *
 * A `certificates` row is auto-issued server-side when an enrollment completes
 * (see the backend). This module is the tenant-scoped, owner-only read surface
 * the mobile app renders them through.
 *
 * TENANT ISOLATION (the #1 rule): every read here goes through the typed
 * `supabase.from('certificates')` client with NO `tenant_id` and NO `user_id`
 * filter for authorization — Postgres RLS scopes every returned row to the
 * caller's own tenant AND (by policy) to the caller's own certificates via the
 * verified session JWT. The client therefore never sends identity for scoping;
 * a forged tenant_id/user_id cannot widen the result. The `user_id` narrowing on
 * `useCertificate` is a convenience filter, NOT the security boundary (RLS is).
 *
 * The course TITLE is joined in the same query via the `certificates_course_id_fkey`
 * relationship (`course:courses(...)`), itself RLS-scoped, so we never leak a
 * cross-tenant course name. When Supabase is unconfigured the hooks degrade to a
 * `backendPending` empty state exactly like the other data hooks — never faked.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CertificateRow } from '@soteria-forge/shared/supabase';
import { supabase, isSupabaseConfigured } from '../supabase';

/** One earned certificate, projected for the UI (course title joined in). */
export interface CertificateRecord {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  /** The human-readable certificate number (e.g. "SF-2026-000123"). */
  certificateNumber: string;
  /** ISO timestamp the certificate was issued at (course completion). */
  issuedAt: string;
  /** ISO expiry timestamp, when the tenant configures certificate expiry. */
  expiresAt?: string;
  /** Score recorded on the certificate, 0..100, when present. */
  score?: number;
  /** Course title, joined from `courses` (RLS-scoped) for display. */
  courseTitle: string;
}

export interface UseCertificatesResult {
  certificates: CertificateRecord[];
  loading: boolean;
  /** Set when Supabase isn't configured yet — screens show an explanatory state. */
  backendPending: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCertificateResult {
  certificate: CertificateRecord | null;
  loading: boolean;
  backendPending: boolean;
  error: string | null;
  refetch: () => void;
}

/** The joined row shape our SELECT returns (certificate + its course title). */
type CertificateJoinRow = CertificateRow & {
  course: { title: string } | { title: string }[] | null;
};

/** Pull the joined course title out (PostgREST may hand back an object or array). */
function joinedCourseTitle(row: CertificateJoinRow): string {
  const c = row.course;
  if (!c) return 'Course';
  const one = Array.isArray(c) ? c[0] : c;
  return one?.title ?? 'Course';
}

function rowToRecord(row: CertificateJoinRow): CertificateRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    courseId: row.course_id,
    certificateNumber: row.certificate_number,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at ?? undefined,
    score: row.score ?? undefined,
    courseTitle: joinedCourseTitle(row),
  };
}

/** Only NON-revoked certificates are earned achievements the learner can show. */
const CERT_SELECT = '*, course:courses(title)';

/**
 * List ALL of the caller's earned certificates (RLS-scoped, owner-only), newest
 * first. Revoked certificates are excluded. Returns the standard {…, backendPending,
 * error, refetch} shape the screens consume.
 */
export function useCertificates(): UseCertificatesResult {
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBackendPending(false);

    if (!isSupabaseConfigured) {
      setBackendPending(true);
      setCertificates([]);
      setLoading(false);
      return;
    }

    try {
      // RLS-scoped: no tenant_id/user_id sent for authorization. The server
      // returns ONLY the caller's own certificates. `revoked_at is null` keeps
      // revoked certs out of the earned list.
      const { data, error: readError } = await supabase
        .from('certificates')
        .select(CERT_SELECT)
        .is('revoked_at', null)
        .order('issued_at', { ascending: false });
      if (readError) throw new Error(readError.message);
      // The embedded-join select shape is inferred by PostgREST; normalize to our
      // hand-written join row (through `unknown` so the cast is version-robust).
      const rows = (data ?? []) as unknown as CertificateJoinRow[];
      setCertificates(rows.map(rowToRecord));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificates');
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(), [load]);

  return { certificates, loading, backendPending, error, refetch };
}

/**
 * Fetch the caller's certificate for ONE course, if earned (RLS-scoped,
 * owner-only). Returns null when the course isn't complete/certified yet. Drives
 * the "Certificate earned" affordance on the course detail.
 */
export function useCertificate(courseId: string | undefined): UseCertificateResult {
  const [certificate, setCertificate] = useState<CertificateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId) {
      setCertificate(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setBackendPending(false);

    if (!isSupabaseConfigured) {
      setBackendPending(true);
      setCertificate(null);
      setLoading(false);
      return;
    }

    try {
      // RLS-scoped + owner-only by policy; the course_id narrows to this course.
      // `maybeSingle` tolerates "no certificate yet" (the common not-complete case).
      const { data, error: readError } = await supabase
        .from('certificates')
        .select(CERT_SELECT)
        .eq('course_id', courseId)
        .is('revoked_at', null)
        .order('issued_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      setCertificate(data ? rowToRecord(data as unknown as CertificateJoinRow) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load certificate');
      setCertificate(null);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refetch = useCallback(() => void load(), [load]);

  return { certificate, loading, backendPending, error, refetch };
}
