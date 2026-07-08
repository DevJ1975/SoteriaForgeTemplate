/**
 * CertificateView — renders a `CertificateRecord` with the `@soteria-forge/ui`
 * `Certificate` component, mapping our domain fields onto its props, and topping
 * it with a lifecycle STATUS strip (Valid / Expiring soon / Expired / Revoked).
 *
 * The kit's `Certificate` is prop-driven and self-scaling (via `ScaledSurface`),
 * so it fits any container width while keeping its print proportions. This
 * wrapper owns ONLY the record→prop mapping, formatting (date, score), and the
 * status treatment so both the course-detail affordance and the "My Certificates"
 * list render identically.
 *
 * A lapsed certificate must NOT read as a clean "valid achievement": an
 * expired/revoked cert shows a danger-toned status pill ("Expired <date>" /
 * "Revoked") and the certificate art itself is dimmed so it visibly reads as an
 * inactive credential. Status is derived by the shared, node-safe
 * `deriveCertificateStatus`. All colour/type come from `useTheme()` tokens — no
 * hardcoded brand hex.
 *
 * The recipient name/email comes from the VERIFIED session (passed in by the
 * caller via `recipientName`), never from the certificate row — the row is
 * owner-scoped by RLS, but the display name is the session identity.
 */
import { View, Text } from 'react-native';
import { Badge, Certificate, useTheme } from '@soteria-forge/ui';
import type { CertificateRecord } from '../api';
import { deriveCertificateStatus, type CertificateStatus } from '../api';

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

/** Badge tone per lifecycle status — expired/revoked read as danger, never success. */
const STATUS_TONE: Record<CertificateStatus, 'success' | 'warning' | 'danger'> = {
  valid: 'success',
  expiring: 'warning',
  expired: 'danger',
  revoked: 'danger',
};

export function CertificateView({ certificate, recipientName, style }: CertificateViewProps) {
  const theme = useTheme();
  const info = deriveCertificateStatus(certificate);

  // Status pill label + a supporting muted line (expiry/revocation detail).
  let pill: string;
  let detail: string | null = null;
  switch (info.status) {
    case 'expired':
      pill = 'Expired';
      detail = certificate.expiresAt ? `Expired ${formatDate(certificate.expiresAt)}` : 'This certificate has expired';
      break;
    case 'revoked':
      pill = 'Revoked';
      detail = certificate.revokedAt ? `Revoked ${formatDate(certificate.revokedAt)}` : 'This certificate has been revoked';
      break;
    case 'expiring': {
      pill = 'Expiring soon';
      const days = info.daysUntilExpiry;
      const when = certificate.expiresAt ? formatDate(certificate.expiresAt) : null;
      detail =
        days != null && when
          ? `Expires in ${days} day${days === 1 ? '' : 's'} · ${when}`
          : when
            ? `Expires ${when}`
            : null;
      break;
    }
    default:
      pill = 'Valid';
      detail = certificate.expiresAt ? `Valid until ${formatDate(certificate.expiresAt)}` : null;
      break;
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Badge label={pill} tone={STATUS_TONE[info.status]} solid={!info.isValid} />
        {detail ? (
          <Text
            style={{
              flex: 1,
              color: info.isValid ? theme.colors.textMuted : theme.colors.danger,
              fontFamily: theme.fonts.body,
              fontSize: 13,
              lineHeight: 18,
            }}
            numberOfLines={2}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {/* Dim a lapsed credential so it visibly reads as inactive, not a live award. */}
      <View style={{ opacity: info.isValid ? 1 : 0.55 }}>
        <Certificate
          recipientName={recipientName}
          courseName={certificate.courseTitle}
          completionDate={formatDate(certificate.issuedAt)}
          score={certificate.score != null ? `${Math.round(certificate.score)}%` : '—'}
          certId={certificate.certificateNumber}
          style={style}
        />
      </View>
    </View>
  );
}
