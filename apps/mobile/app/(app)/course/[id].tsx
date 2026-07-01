/**
 * Route wrapper for a single course detail. The `[id]` param is read inside the
 * screen via `useLocalSearchParams`; the lookup is tenant-scoped, so an id from
 * a deep link can only ever resolve within the caller's own tenant.
 */
import { CourseDetailScreen } from '../../../src/screens';

export default CourseDetailScreen;
