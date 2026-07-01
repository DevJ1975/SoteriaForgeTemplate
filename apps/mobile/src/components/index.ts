/**
 * Shared presentational components barrel.
 */
export { Screen } from './Screen';
export type { ScreenProps } from './Screen';
export { OfflineBanner } from './OfflineBanner';
/**
 * Back-compat: the banner's connectivity shape now lives in the offline layer
 * (OfflineContextValue). Re-exported here under the original `Connectivity` name
 * so existing importers of `@/components` keep working.
 */
export type { OfflineContextValue as Connectivity } from '../offline';
