import { useState } from 'react'
import { useInstallPrompt } from './useInstallPrompt'

function DownloadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}

/**
 * Header affordance to install the PWA. Chromium shows a working Install
 * button; iOS Safari shows the same button but toggles a short Add-to-Home
 * hint (no programmatic prompt exists there). Renders nothing when already
 * installed or when installation isn't offered.
 */
export function InstallButton() {
  const { canPrompt, iosHint, promptInstall } = useInstallPrompt()
  const [showIosTip, setShowIosTip] = useState(false)

  if (canPrompt) {
    return (
      <button
        type="button"
        className="btn btn--ghost install-btn"
        onClick={() => void promptInstall()}
      >
        <DownloadGlyph />
        <span>Install</span>
      </button>
    )
  }

  if (iosHint) {
    return (
      <span className="install-ios">
        <button
          type="button"
          className="btn btn--ghost install-btn"
          onClick={() => setShowIosTip((open) => !open)}
          aria-expanded={showIosTip}
        >
          <DownloadGlyph />
          <span>Install</span>
        </button>
        {showIosTip ? (
          <span className="install-ios__tip" role="dialog" aria-label="How to install">
            Tap the Share icon, then <strong>Add to Home&nbsp;Screen</strong>.
          </span>
        ) : null}
      </span>
    )
  }

  return null
}
