// Android: the choices in a sheet from the bottom of the screen, Cancel at the end. A tap outside or
// the back button cancels.

import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/constants/theme';
import type { ActionSheetRequest } from './feedback-types';
import { Text } from './Text';
import { Touchable } from './Touchable';

export function ActionSheetHost({ request, onDone }: { request: ActionSheetRequest | null; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  /** Closes the sheet, then runs the choice. */
  const finish = (then?: () => void) => {
    onDone();
    then?.();
  };
  return (
    <Modal visible={!!request} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => finish(request?.onCancel)}>
      <Pressable style={styles.dim} onPress={() => finish(request?.onCancel)} accessibilityLabel="Cancel" />
      {request ? (
        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) }]} accessibilityViewIsModal>
          {request.title || request.message ? (
            <View style={styles.head}>
              {request.title ? (
                <Text variant="headline" color={colors.label}>
                  {request.title}
                </Text>
              ) : null}
              {request.message ? (
                <Text variant="subheadline" color={colors.secondary}>
                  {request.message}
                </Text>
              ) : null}
            </View>
          ) : null}
          {request.actions.map((a) => (
            <Touchable key={a.label} feedback="highlight" onPress={() => finish(a.onPress)} accessibilityRole="button" style={styles.choice}>
              <Text variant="body" color={a.destructive ? colors.destructive : colors.label}>
                {a.label}
              </Text>
            </Touchable>
          ))}
          <Touchable feedback="highlight" onPress={() => finish(request.onCancel)} accessibilityRole="button" style={styles.choice}>
            <Text variant="body" weight="600" color={colors.tint}>
              {request.cancelLabel ?? 'Cancel'}
            </Text>
          </Touchable>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(19, 32, 40, 0.4)' },
  panel: { backgroundColor: colors.cell, paddingTop: 8 },
  head: { gap: 4, paddingHorizontal: layout.inset, paddingTop: 10, paddingBottom: 12, borderBottomWidth: layout.hairline, borderBottomColor: colors.border },
  choice: { minHeight: 52, justifyContent: 'center', paddingHorizontal: layout.inset },
});
