import React from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { useTheme, elevation } from './theme';

export type DialogProps = {
  visible: boolean;
  onClose?: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Buttons row, rendered bottom-right. Pass <Button/>s. */
  actions?: React.ReactNode;
  /** Tap outside to dismiss (default true). */
  dismissable?: boolean;
  style?: any;
};

/** Centered modal dialog / alert. Works on iOS, Android and web. */
export function Dialog({ visible, onClose, title, children, actions, dismissable = true, style }: DialogProps) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={dismissable ? onClose : undefined}
        style={{ flex: 1, backgroundColor: t.colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={(e: any) => e.stopPropagation?.()}
          style={[
            { width: '100%', maxWidth: 440, backgroundColor: t.colors.surface, borderRadius: t.radii.lg, borderWidth: 1, borderColor: t.colors.border, padding: 24 },
            elevation(3),
            style,
          ]}
        >
          {title ? (
            <Text style={{ fontFamily: t.fonts.display, fontWeight: '700', fontSize: 22, color: t.colors.text, marginBottom: 10 }}>{title}</Text>
          ) : null}
          {typeof children === 'string' ? (
            <Text style={{ fontFamily: t.fonts.body, fontSize: 15, lineHeight: 22, color: t.colors.textMuted }}>{children}</Text>
          ) : (
            children
          )}
          {actions ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>{actions}</View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
