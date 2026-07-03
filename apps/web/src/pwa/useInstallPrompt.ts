import { useCallback, useEffect, useState } from 'react'

/**
 * Installability, across the two worlds:
 *   - Chromium (Android / desktop Chrome+Edge) fires `beforeinstallprompt`,
 *     which we capture and replay on demand from an in-app button.
 *   - iOS Safari has no programmatic prompt — the only path is the Share sheet →
 *     "Add to Home Screen", so we expose an `iosHint` flag to show guidance.
 * Already-installed (standalone) sessions expose neither.
 */

// `beforeinstallprompt` is not in the standard DOM lib types.
interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  // iOS Safari exposes navigator.standalone rather than the display-mode query.
  const iosStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return displayMode || iosStandalone
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  // iPadOS 13+ reports as Mac; also treat a touch-capable "Mac" as iOS-like.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export interface InstallState {
  /** A native install prompt is queued (Chromium). */
  canPrompt: boolean
  /** The app is already running installed/standalone. */
  installed: boolean
  /** iOS Safari, not yet installed — show the manual Add-to-Home-Screen hint. */
  iosHint: boolean
  /** Fire the captured native prompt; resolves to the user's choice. */
  promptInstall: () => Promise<InstallOutcome>
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Suppress Chrome's default mini-infobar; we drive the prompt ourselves.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable'
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // A prompt can only be used once; drop it whatever the choice.
    setDeferred(null)
    return outcome
  }, [deferred])

  return {
    canPrompt: deferred !== null && !installed,
    installed,
    iosHint: !installed && isIos(),
    promptInstall,
  }
}
