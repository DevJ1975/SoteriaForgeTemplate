import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The web surface is an installable PWA (ADR-0010). The service worker
// precaches the built app shell so a returning learner can open the app with no
// network; auth + tenant-scoped data are deliberately NEVER cached (see the
// runtimeCaching NetworkOnly rules below) — RLS data must always be fresh and
// must never be served stale from a shared cache. Google Fonts are cached so
// the offline shell keeps its type.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a learner mid-lesson must not be reloaded
      // out from under them. A new SW waits; the app surfaces a "new version"
      // toast and only reloads when the user accepts (see src/pwa/PwaNotices).
      registerType: 'prompt',
      // Registration happens in-app via useRegisterSW (PwaNotices), so the
      // plugin must not also inject a register script; it still injects the
      // manifest <link> and provides the virtual modules.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Soteria Forge',
        short_name: 'Soteria Forge',
        description: 'Browse and play your assigned safety training.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F1EEE8',
        theme_color: '#1A1D22',
        lang: 'en',
        categories: ['education', 'business'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built shell (JS/CSS/HTML/icons/fonts we ship ourselves).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // Claim clients on first activation (so the very first load becomes
        // offline-ready immediately). We do NOT skipWaiting: an UPDATE waits
        // until the user accepts the reload prompt.
        clientsClaim: true,
        // SPA: unknown navigations resolve to the cached app shell (so deep
        // links like /courses/:id work offline), EXCEPT anything that looks
        // like a real backend/asset request.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/sw\.js$/, /^\/manifest\.webmanifest$/],
        runtimeCaching: [
          {
            // Supabase (auth + RLS-scoped data): NEVER cached. Freshness and
            // tenant isolation over offline convenience — a cached response
            // could serve one user's data after a session change.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
          {
            // Cloudflare Stream video + signed URLs: never cached (large, and
            // the signed tokens expire).
            urlPattern: ({ url }) =>
              url.hostname.endsWith('cloudflarestream.com') ||
              url.hostname.endsWith('videodelivery.net'),
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts stylesheet — revalidate in the background.
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            // Google Fonts files — immutable, cache long.
            urlPattern: ({ url }) => url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Keep the SW OUT of `vite dev` — it only complicates the dev loop.
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5182,
    strictPort: true,
  },
})
