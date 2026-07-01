/**
 * Route wrapper for the lesson player. The `[id]` param (the lesson id) is read
 * inside the screen via `useLocalSearchParams`; the lookup is tenant-scoped by
 * RLS, so a lesson id from a deep link can only ever resolve within the caller's
 * own tenant. Completion is emitted through the append-only offline queue — the
 * screen never writes to Supabase directly.
 */
import { LessonPlayerScreen } from '../../../src/screens';

export default LessonPlayerScreen;
