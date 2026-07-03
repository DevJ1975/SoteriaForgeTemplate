import { useRegisterSW } from 'virtual:pwa-register/react'
import { useOnlineStatus } from './useOnlineStatus'

/**
 * The PWA's ambient status UI, mounted once at the app root:
 *   - a slim OFFLINE bar while the browser reports no connection,
 *   - a "new version available" toast when an updated service worker is
 *     waiting (the user chooses when to reload — never mid-lesson), and
 *   - a one-time "ready to work offline" confirmation on first install.
 *
 * `useRegisterSW` also performs the actual SW registration (the Vite plugin is
 * configured with injectRegister:null so this is the single registration site).
 */
export function PwaNotices() {
  const online = useOnlineStatus()
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // A failed SW registration must never break the app — it just means no
      // offline/installable enhancement this session.
      // eslint-disable-next-line no-console
      console.warn('[pwa] service worker registration failed:', error)
    },
  })

  return (
    <>
      {!online ? (
        <div className="pwa-offline-bar" role="status">
          You’re offline — showing what’s cached. Signing in and loading fresh
          course data need a connection.
        </div>
      ) : null}

      {needRefresh ? (
        <div className="pwa-toast" role="alert">
          <span className="pwa-toast__text">A new version of Soteria Forge is available.</span>
          <span className="pwa-toast__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void updateServiceWorker(true)}
            >
              Reload
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setNeedRefresh(false)}
            >
              Later
            </button>
          </span>
        </div>
      ) : offlineReady ? (
        <div className="pwa-toast" role="status">
          <span className="pwa-toast__text">Ready to work offline.</span>
          <span className="pwa-toast__actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOfflineReady(false)}
            >
              Got it
            </button>
          </span>
        </div>
      ) : null}
    </>
  )
}
