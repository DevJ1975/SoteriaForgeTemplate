/**
 * API barrel — the tenant-scoped data access surface.
 */
export { getDataClient, BackendNotConfiguredError } from './dataClient';
export type { DataClient } from './dataClient';
export { useCourses } from './useCourses';
export type { UseCoursesResult } from './useCourses';
