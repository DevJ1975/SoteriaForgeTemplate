/**
 * CertificateView — renders a `CertificateRecord` with the `@soteria-forge/ui`
 * `Certificate` component, mapping our domain fields onto its props.
 *
 * The kit's `Certificate` is prop-driven and self-scaling (via `ScaledSurface`),
 * so it fits any container width while keeping its print proportions. This
 * wrapper owns ONLY the record→prop mapping and formatting (date, score) so both
 * the course-detail affordance and the "My Certificates" list render identically.
 *
 * The recipient name/email comes from the VERIFIED session (passed in by the
 * caller via `recipientName`), never from the certificate row — the row is
 * owner-scoped by RLS, but the display name is the session identity.
 */
import { Certificate } from '@soteria-forge/ui';
import type { CertificateRecord } from '../api';

export interface CertificateViewProps {
  certificate: CertificateRecord;
  /** The learner's display name/email — from the verified session. */
  recipientName: string;
  style?: any;
}

/** Format an ISO timestamp as a readable completion date, resilient to bad input. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function CertificateView({ certificate, recipientName, style }: CertificateViewProps) {
  return (
    <Certificate
      recipientName={recipientName}
      courseName={certificate.courseTitle}
      completionDate={formatDate(certificate.issuedAt)}
      score={certificate.score != null ? `${Math.round(certificate.score)}%` : '—'}
      certId={certificate.certificateNumber}
      style={style}
    />
  );
}
