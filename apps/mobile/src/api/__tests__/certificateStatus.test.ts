/**
 * Tests for the certificate lifecycle status derivation — the client-side
 * judgement that keeps an EXPIRED or REVOKED certificate from reading as a clean
 * valid achievement (recertification / issue #3). Runner: node:test +
 * node:assert/strict (see tsconfig.test.json). `now` is injected so the "days
 * until expiry" boundaries are deterministic.
 *
 * This module must stay node-safe — it pulls in NO react-native/expo/Supabase —
 * so it can be exercised here without a device.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCertificateStatus,
  countValidCertificates,
  EXPIRING_SOON_DAYS,
} from '../certificateStatus';

const NOW = new Date('2026-07-08T12:00:00.000Z');
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

test('no expiry and not revoked → always valid', () => {
  const info = deriveCertificateStatus({}, NOW);
  assert.equal(info.status, 'valid');
  assert.equal(info.isValid, true);
  assert.equal(info.daysUntilExpiry, undefined);
});

test('expiry comfortably in the future → valid', () => {
  const info = deriveCertificateStatus({ expiresAt: daysFromNow(200) }, NOW);
  assert.equal(info.status, 'valid');
  assert.equal(info.isValid, true);
  assert.equal(info.daysUntilExpiry, 200);
});

test('expiry within the expiring-soon window (inclusive) → expiring, still valid', () => {
  const info = deriveCertificateStatus({ expiresAt: daysFromNow(EXPIRING_SOON_DAYS) }, NOW);
  assert.equal(info.status, 'expiring');
  assert.equal(info.isValid, true);
  assert.equal(info.daysUntilExpiry, EXPIRING_SOON_DAYS);
});

test('one day past the window → still valid, not expiring', () => {
  const info = deriveCertificateStatus({ expiresAt: daysFromNow(EXPIRING_SOON_DAYS + 1) }, NOW);
  assert.equal(info.status, 'valid');
  assert.equal(info.isValid, true);
});

test('past expiry → expired, not valid', () => {
  const info = deriveCertificateStatus({ expiresAt: daysFromNow(-1) }, NOW);
  assert.equal(info.status, 'expired');
  assert.equal(info.isValid, false);
  assert.ok((info.daysUntilExpiry ?? 0) <= 0);
});

test('exactly at expiry instant → expired (ms <= 0 is inclusive)', () => {
  const info = deriveCertificateStatus({ expiresAt: NOW.toISOString() }, NOW);
  assert.equal(info.status, 'expired');
  assert.equal(info.isValid, false);
});

test('revoked wins over any expiry state', () => {
  const info = deriveCertificateStatus(
    { expiresAt: daysFromNow(200), revokedAt: daysFromNow(-5) },
    NOW,
  );
  assert.equal(info.status, 'revoked');
  assert.equal(info.isValid, false);
  assert.equal(info.revokedAt, daysFromNow(-5));
});

test('malformed expiry is treated as no-expiry, never a crash', () => {
  const info = deriveCertificateStatus({ expiresAt: 'not-a-date' }, NOW);
  assert.equal(info.status, 'valid');
  assert.equal(info.isValid, true);
});

test('countValidCertificates counts only currently-valid (valid + expiring)', () => {
  const certs = [
    {}, // valid (no expiry)
    { expiresAt: daysFromNow(200) }, // valid
    { expiresAt: daysFromNow(10) }, // expiring → still valid
    { expiresAt: daysFromNow(-1) }, // expired
    { revokedAt: daysFromNow(-2) }, // revoked
  ];
  assert.equal(countValidCertificates(certs, NOW), 3);
});
