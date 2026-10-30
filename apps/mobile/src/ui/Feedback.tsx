// Short messages and choices that float over the app: a toast with Undo after removing an item,
// and the action sheet that asks before throwing away unsaved changes.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionSheetIOS, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { ActionSheetHost } from './ActionSheetHost';
import type { ActionSheetRequest, ToastRequest } from './feedback-types';
import { Text } from './Text';
import { Touchable } from './Touchable';

export type { ActionSheetRequest, ToastRequest } from './feedback-types';

interface FeedbackApi {
  toast: (request: ToastRequest) => void;
  actionSheet: (request: ActionSheetRequest) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error('useFeedback needs the FeedbackProvider from the root layout');
  return api;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastRequest & { id: number }) | null>(null);
  const [sheet, setSheet] = useState<ActionSheetRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    timer.current = setTimeout(() => setToast(null), 4500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);

  const showActionSheet = useCallback((request: ActionSheetRequest) => {
    if (Platform.OS === 'ios') {
      const labels = [...request.actions.map((a) => a.label), request.cancelLabel ?? 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: request.title,
          message: request.message,
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: request.actions.flatMap((a, i) => (a.destructive ? [i] : [])),
          tintColor: colors.tint,
        },
        (index) => {
          if (index < request.actions.length) request.actions[index]?.onPress();
        },
      );
      return;
    }
    setSheet(request);
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({ toast: (request) => setToast({ ...request, id: Date.now() }), actionSheet: showActionSheet }),
    [showActionSheet],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.toastLayer, { paddingBottom: insets.bottom + 92 }]}>
        {toast ? (
          <Animated.View
            key={toast.id}
            entering={FadeInDown.duration(260)}
            exiting={FadeOutDown.duration(200)}
            style={styles.toast}
            accessibilityLiveRegion="polite"
            role="status"
          >
            <Text variant="subheadline" weight="600" color={colors.white} style={{ flexShrink: 1 }}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Touchable
                feedback="opacity"
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                onPress={() => {
                  toast.action?.onPress();
                  setToast(null);
                }}
              >
                <Text variant="subheadline" weight="700" color={colors.white} style={{ textDecorationLine: 'underline' }}>
                  {toast.action.label}
                </Text>
              </Touchable>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
      <ActionSheetHost request={sheet} onDone={() => setSheet(null)} />
    </FeedbackContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastLayer: { justifyContent: 'flex-end', alignItems: 'center', zIndex: 900 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    maxWidth: 360,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(29, 29, 31, 0.94)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  },
});
