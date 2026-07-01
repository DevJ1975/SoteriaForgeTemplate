/**
 * Auth barrel — everything auth-related is imported from `@/auth`.
 */
export { AuthProvider, useAuth, useTenantId } from './AuthProvider';
export type { AuthUser, AuthStatus } from './AuthProvider';
export { configureAmplify, isAmplifyConfigured } from './amplifyConfig';
