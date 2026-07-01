/**
 * Route wrapper for "My Certificates". The screen reads the caller's OWN
 * certificates through `useCertificates()`, which is tenant-scoped and owner-only
 * by Postgres RLS — no identity is sent from the client for authorization.
 */
import { CertificatesScreen } from '../../src/screens';

export default CertificatesScreen;
