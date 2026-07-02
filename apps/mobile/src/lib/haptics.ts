/**
 * haptics — a thin, fail-silent wrapper around `expo-haptics`.
 *
 * The native module may be absent (web, a dev client built before the dep was
 * added, or tests), so every call lazy-imports inside try/catch and no-ops on
 * ANY failure. Feature code calls `selection()` / `success()` / `error()` and
 * never needs to know whether haptics actually fired.
 */

type HapticsModule = typeof import('expo-haptics');

async function getHaptics(): Promise<HapticsModule | null> {
  try {
    return await import('expo-haptics');
  } catch {
    // Native module unavailable — silently disable haptics.
    return null;
  }
}

/** Light tick for selections (segmented controls, toggles, pickers). */
export function selection(): void {
  void (async () => {
    try {
      const haptics = await getHaptics();
      if (haptics) await haptics.selectionAsync();
    } catch {
      /* no-op */
    }
  })();
}

/** Success notification (e.g. lesson completion recorded). */
export function success(): void {
  void (async () => {
    try {
      const haptics = await getHaptics();
      if (haptics) await haptics.notificationAsync(haptics.NotificationFeedbackType.Success);
    } catch {
      /* no-op */
    }
  })();
}

/** Error notification (e.g. sign-in or submit failure). */
export function error(): void {
  void (async () => {
    try {
      const haptics = await getHaptics();
      if (haptics) await haptics.notificationAsync(haptics.NotificationFeedbackType.Error);
    } catch {
      /* no-op */
    }
  })();
}
