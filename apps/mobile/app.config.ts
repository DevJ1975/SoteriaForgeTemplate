import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config.
 *
 * The static baseline lives in `app.json`; this file layers environment-driven
 * values on top so the same binary can point at different backends without a
 * source edit. Everything here is build-time metadata only — NO secrets. The
 * Supabase URL + publishable/anon key are CLIENT-SAFE (RLS-protected) and are
 * read primarily from `EXPO_PUBLIC_*` env at build time; we also mirror them into
 * `extra` as an `expo-constants` fallback (see src/supabase/client.ts).
 *
 * This is a CUSTOM DEV CLIENT app (expo-dev-client): it uses native modules
 * (react-native-video, WatermelonDB, NetInfo) that are NOT in Expo Go, so it must
 * be run via a dev client build (`expo run:ios` / `expo run:android` or an EAS
 * dev build), not Expo Go. (@supabase/supabase-js is pure JS and needs no native
 * module — but the app still requires a dev client for the others.)
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.APP_ENV ?? 'development';

  return {
    ...config,
    name: config.name ?? 'Soteria Forge',
    slug: config.slug ?? 'soteria-forge-mobile',
    extra: {
      ...config.extra,
      appEnv,
      // Non-secret runtime hints + client-safe Supabase config fallback. The
      // primary source is EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
      // (inlined into the bundle); these mirror them for the expo-constants path.
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      xapiSyncBatchSize: Number(process.env.XAPI_SYNC_BATCH_SIZE ?? 25),
    },
  };
};
