/**
 * Motion utilities — reduced-motion awareness for kit animations.
 *
 * `useReducedMotion()` reflects the OS-level "reduce motion" accessibility
 * setting (iOS / Android; react-native-web returns false where unsupported).
 * Kit components consult it to swap animations for instant state changes.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns true when the user has requested reduced motion at the OS level.
 * Defaults to false until the async query resolves; subscribes to live changes.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduced(!!enabled);
      })
      .catch(() => {
        /* unsupported platform — keep default false */
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduced(!!enabled);
    });

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
