/**
 * Route wrapper for "My Training Record". The screen reads the signed-in user's
 * OWN locally-recorded completions via the offline read-model hook, fenced by the
 * verified session id — no identity is sent from the client for authorization
 * (Postgres RLS scopes the server side; the local user_id fence scopes the store).
 */
import { TrainingRecordScreen } from '../../src/screens';

export default TrainingRecordScreen;
