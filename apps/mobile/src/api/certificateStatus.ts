/**
 * Certificate lifecycle status — a pure, node-safe derivation of a certificate's
 * current standing from its `expiresAt` + `revokedAt` fields.
 *
 * WHY this exists (recertification / issue #3): a certificate row is auto-issued
 * on course completion, but it can later LAPSE — either time-expire (`expires_at`
 * passes) or be revoked (`revoked_at` set). Migration 15 makes expiry real: when a
 * cert expires the enrollment is reset so the worker must re-demonstrate mastery.
 * The client must therefore never present an expired/revoked certificate as a
 * clean "valid achievement". This module is the single source of that judgement.
 *
 * It is deliberately dependency-free (no `react`, no `react-native`, no Supabase)
 * so it stays in the node-safe unit-test import graph and both the list screen and
 * the certificate view derive status identically. `now` is injectable for testing.
 */
import type { CertificateRecord } from './certificates';

/** How close to `expiresAt` (inclusive) a still-valid cert is flagged "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export type CertificateStatus = 'valid' | 'expiring' | 'expired' | 'revoked';

export interface CertificateStatusInfo {
  status: CertificateStatus;
  /**
   * True only when the certificate is CURRENTLY VALID — i.e. `valid` or
   * `expiring` (expiring-soon certs are still valid, just nearing renewal).
   * `expired` and `revoked` are never counted as valid.
   */
  isValid: boolean;
  /**
   * Whole days until `expiresAt` (rounded up), negative once past. `undefined`
   * when the certificate has no expiry configured or a revoked cert.
   */
  daysUntilExpiry?: number;
  /** Echoed through for convenience (may be undefined when no expiry is set). */
  expiresAt?: string;
  /** Echoed through for convenience (present only on a revoked cert). */
  revokedAt?: string;
}

/**
 * Derive a certificate's lifecycle status. Precedence: revoked wins over any
 * expiry state (a revoked cert is revoked regardless of its expiry date). A cert
 * with no `expiresAt` (and not revoked) never expires — it is always `valid`. A
 * malformed `expiresAt` is treated as "no expiry" rather than crashing the UI.
 */
export function deriveCertificateStatus(
  cert: Pick<CertificateRecord, 'expiresAt' | 'revokedAt'>,
  now: Date = new Date(),
): CertificateStatusInfo {
  if (cert.revokedAt) {
    return {
      status: 'revoked',
      isValid: false,
      expiresAt: cert.expiresAt,
      revokedAt: cert.revokedAt,
    };
  }

  if (cert.expiresAt) {
    const exp = new Date(cert.expiresAt);
    if (!Number.isNaN(exp.getTime())) {
      const ms = exp.getTime() - now.getTime();
      const daysUntilExpiry = Math.ceil(ms / MS_PER_DAY);
      if (ms <= 0) {
        return { status: 'expired', isValid: false, daysUntilExpiry, expiresAt: cert.expiresAt };
      }
      if (daysUntilExpiry <= EXPIRING_SOON_DAYS) {
        return { status: 'expiring', isValid: true, daysUntilExpiry, expiresAt: cert.expiresAt };
      }
      return { status: 'valid', isValid: true, daysUntilExpiry, expiresAt: cert.expiresAt };
    }
  }

  return { status: 'valid', isValid: true, expiresAt: cert.expiresAt };
}

/** Count of certificates that are CURRENTLY VALID (valid or expiring-soon). */
export function countValidCertificates(
  certs: ReadonlyArray<Pick<CertificateRecord, 'expiresAt' | 'revokedAt'>>,
  now: Date = new Date(),
): number {
  return certs.reduce((n, c) => (deriveCertificateStatus(c, now).isValid ? n + 1 : n), 0);
}
