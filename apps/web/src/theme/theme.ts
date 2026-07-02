/**
 * Theme preference — the web surface's `sf-theme` contract.
 *
 * The preference is one of 'light' | 'dark' | 'system', persisted in
 * localStorage under the key "sf-theme" and applied as a `data-theme`
 * attribute on `document.documentElement`:
 *   - 'light'  → data-theme="light"
 *   - 'dark'   → data-theme="dark"
 *   - 'system' → attribute ABSENT, so the `prefers-color-scheme` block in
 *                theme/tokens.css decides.
 *
 * Zero dependencies. Storage access is try/catch-safe: when localStorage is
 * unavailable (private mode, blocked storage), reads fall back to 'system'
 * and writes are best-effort — the attribute is still applied for the session.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'sf-theme'

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Read the persisted preference; defaults to 'system' when unset or unreadable. */
export function getStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(stored)) return stored
  } catch {
    // localStorage unavailable — treat as unset.
  }
  return 'system'
}

/**
 * Apply a preference to the document: set `data-theme` for an explicit choice,
 * remove it for 'system' so the OS-level prefers-color-scheme styling wins.
 */
export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement
  if (pref === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', pref)
  }
}

/** Persist (best-effort) and apply a preference. */
export function setTheme(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Persistence is best-effort — still apply for this session.
  }
  applyTheme(pref)
}
