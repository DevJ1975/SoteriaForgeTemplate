import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Animated, View, Text, Platform } from 'react-native';
import { useTheme, elevation } from './theme';
import { useReducedMotion } from './motion';

export type ToastType = 'default' | 'success' | 'danger' | 'info';
export type ShowToast = (message: string, opts?: { type?: ToastType; duration?: number }) => void;

const ToastCtx = createContext<ShowToast>(() => {});

/** Call inside any component under <ToastProvider>: const toast = useToast(); toast('Saved', { type:'success' }) */
export function useToast(): ShowToast {
  return useContext(ToastCtx);
}

/**
 * Wrap your app root once:
 *   <ToastProvider><App/></ToastProvider>
 * Renders a transient snackbar pinned to the bottom (works iOS/Android/web).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const reducedMotion = useReducedMotion();
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const timer = useRef<any>(null);

  const show = useCallback<ShowToast>((message, opts = {}) => {
    const type = opts.type || 'default';
    const duration = opts.duration ?? 2600;
    setToast({ message, type });
    const native = Platform.OS !== 'web';
    if (reducedMotion) {
      // No entrance motion — appear/disappear instantly.
      opacity.setValue(1);
      translateY.setValue(0);
    } else {
      translateY.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: native }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: native }),
      ]).start();
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (reducedMotion) {
        opacity.setValue(0);
        setToast(null);
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: native }).start(() => setToast(null));
    }, duration);
  }, [opacity, translateY, reducedMotion]);

  const accent =
    toast?.type === 'success' ? t.colors.success :
    toast?.type === 'danger' ? t.colors.danger :
    toast?.type === 'info' ? t.colors.info : t.colors.accent;

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 40, opacity, transform: [{ translateY }], alignItems: 'center' }}>
          <View
            style={[
              { maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.mode === 'dark' ? '#262A31' : '#1A1D22', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18 },
              elevation(3),
            ]}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
            <Text style={{ color: '#F4F2EE', fontFamily: t.fonts.body, fontSize: 14.5, flexShrink: 1 }}>{toast.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}
