// Taps you can feel, the way Apple's own apps use them. iPhone only; the preview page has none.

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS === 'ios';

function run(fn: () => Promise<void>): void {
  if (!on) return;
  fn().catch(() => undefined);
}

export const haptic = {
  /** Moving between choices: a segment, a tile, a picker row. */
  selection: () => run(() => Haptics.selectionAsync()),
  /** A light tap: a button, a swipe action. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Checking an item off. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something needs fixing before it can save. */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** A removal. */
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
};
