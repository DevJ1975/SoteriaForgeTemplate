/**
 * Amplify runtime configuration.
 *
 * The single Cognito user pool + AppSync API are defined-as-code in `backend/`
 * (Amplify Gen 2). When that backend is deployed — or a sandbox is running via
 * `npx ampx sandbox` — the toolchain writes an `amplify_outputs.json` file at
 * the app root describing the pool id, app client id, GraphQL endpoint, region,
 * etc. That file is machine-generated and git-ignored (see .gitignore); it is
 * NOT a secret in the credential sense but is environment-specific.
 *
 * NOTHING is deployed yet, so `amplify_outputs.json` does not exist. We must NOT
 * statically `import`/`require` it here — a bare require of a missing module is
 * a BUILD-TIME resolution error in Metro, not a catchable runtime one, and would
 * break bundling. Instead the caller (AppProviders) tries to load the file
 * behind its own guard and passes whatever it got to `configureAmplify`. Until
 * the file exists the app boots unauthenticated so the shell is still runnable.
 *
 * TENANT ISOLATION NOTE: this file wires up auth transport only. The tenant a
 * caller may touch is derived exclusively from the verified `custom:tenantId`
 * token claim at request time (see useAuth + src/api), never from config here.
 */
import { Amplify } from 'aws-amplify';

let configured = false;

/**
 * Configure Amplify from the generated outputs object.
 *
 * @param outputs Parsed `amplify_outputs.json`, or `null`/`undefined` when the
 *   backend is not deployed yet. Idempotent — safe to call once at app start.
 * @returns whether a real configuration was applied.
 */
export function configureAmplify(outputs?: Record<string, unknown> | null): boolean {
  if (configured) return true;

  if (!outputs) {
    if (__DEV__) {
      console.warn(
        '[amplify] amplify_outputs.json not found — backend is not deployed yet. ' +
          'Run `npx ampx sandbox` in backend/ to generate it. Auth is disabled until then.',
      );
    }
    return false;
  }

  Amplify.configure(outputs, { ssr: false });
  configured = true;
  return true;
}

/** Whether Amplify has a real configuration applied (i.e. a backend exists). */
export function isAmplifyConfigured(): boolean {
  return configured;
}
