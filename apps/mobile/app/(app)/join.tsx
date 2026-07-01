/**
 * Route wrapper for the "Join your team" (invite redemption) screen. Thin by
 * design — implementation lives in src/screens/JoinTenantScreen.
 *
 * This route lives in the signed-in `(app)` group because reaching it requires a
 * verified Supabase session; it is the destination for the `needs-profile`
 * state (signed in, but no profile/tenant yet). The route guard
 * (`useAuthRedirect`) sends `needs-profile` users here and everyone else away.
 */
import { JoinTenantScreen } from '../../src/screens';

export default JoinTenantScreen;
