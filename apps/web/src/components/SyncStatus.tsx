/**
 * SyncStatus — a compact header chip showing the completion outbox's state:
 * offline, N pending upload, or nothing (all clear). It reads the same outbox
 * context the learning surfaces write to, so it can never disagree with what is
 * actually queued, and reuses the browser connectivity signal for the offline
 * hint. Purely a status surface — it never triggers a sync itself.
 *
 * States:
 *   - offline (with pending) → "N pending · offline"
 *   - offline (nothing queued) → "Offline"
 *   - online with pending → "N pending" (syncing in the background)
 *   - online, nothing queued → renders nothing (no chrome when there's nothing to say)
 *
 * Colour comes only from --sf-status-* tokens; no brand hex.
 */
import { useOutbox } from '../offline/OutboxProvider'

export function SyncStatus() {
  const { isOnline, pendingSyncCount } = useOutbox()

  // Online and fully drained — nothing worth showing.
  if (isOnline && pendingSyncCount === 0) return null

  const tone = !isOnline ? 'offline' : 'pending'
  const label = !isOnline
    ? pendingSyncCount > 0
      ? `${pendingSyncCount} pending · offline`
      : 'Offline'
    : `${pendingSyncCount} pending`

  return (
    <span
      className="sync-status"
      data-tone={tone}
      role="status"
      aria-live="polite"
      title={
        !isOnline
          ? 'You’re offline. Recorded completions are saved on this device and will sync when you reconnect.'
          : 'Completions recorded on this device are syncing.'
      }
    >
      <span className="sync-status__dot" aria-hidden="true" />
      {label}
    </span>
  )
}
