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

// Module-scope capture. Chromium fires `beforeinstallprompt` after `load`,
// which can land BEFORE a component's effect registers a listener — so we wire
// the listeners once at module load and stash the event here. The hook then
// initialises from this captured value and subscribes for later changes, so an
// early firing is never lost.
let capturedPrompt: BeforeInstallPromptEvent | null = null
let capturedInstalled = false
const captureSubscribers = new Set<() => void>()

function notifyCaptureSubscribers() {
  for (const fn of captureSubscribers) fn()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Suppress Chrome's default mini-infobar; we drive the prompt ourselves.
    event.preventDefault()
    capturedPrompt = event as BeforeInstallPromptEvent
    notifyCaptureSubscribers()
  })
  window.addEventListener('appinstalled', () => {
    capturedInstalled = true
    capturedPrompt = null
    notifyCaptureSubscribers()
  })
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
  // Seed from the module-scope capture so an early firing is reflected on mount.
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(() => capturedPrompt)
  const [installed, setInstalled] = useState(() => capturedInstalled || isStandalone())

  useEffect(() => {
    const sync = () => {
      setDeferred(capturedPrompt)
      if (capturedInstalled) setInstalled(true)
    }
    captureSubscribers.add(sync)
    // Reconcile against anything captured between the initial render and now.
    sync()
    return () => {
      captureSubscribers.delete(sync)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable'
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // A prompt can only be used once; drop it whatever the choice.
    capturedPrompt = null
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
