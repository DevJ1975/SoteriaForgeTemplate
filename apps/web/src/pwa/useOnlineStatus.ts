import { useEffect, useState } from 'react'

/**
 * Live connectivity from the browser's `navigator.onLine` + online/offline
 * events. This is a coarse signal (onLine only means "has a network interface",
 * not "the backend is reachable"), so the UI uses it for a soft hint — the data
 * screens still rely on their own fetch error states for the authoritative
 * "couldn't reach Supabase" case.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
