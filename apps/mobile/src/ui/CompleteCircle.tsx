// The circle at the start of an item, as in Reminders: tap it to check the item off. The ring turns
// blue and fills in from the middle; nothing grows or bounces.

import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { easeOut } from './Touchable';

const SIZE = 22;

export function CompleteCircle({
  checked,
  onPress,
  label,
  testID,
}: {
  checked: boolean;
  /** Kept for the screens that pass it: the circle no longer pops. */
  animate?: boolean;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 16, right: 12 }}
      accessibilityRole="checkbox"
      aria-checked={checked}
      accessibilityLabel={label}
      testID={testID}
      style={styles.hit}
    >
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: checked ? colors.action : colors.circle,
            transitionProperty: 'borderColor',
            transitionDuration: motion.base,
            transitionTimingFunction: easeOut,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.dot,
            {
              opacity: checked ? 1 : 0,
              transform: [{ scale: checked ? 1 : 0.4 }],
              transitionProperty: ['opacity', 'transform'],
              transitionDuration: motion.slow,
              transitionTimingFunction: easeOut,
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { paddingTop: 1 },
  ring: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell },
  dot: { width: SIZE - 8, height: SIZE - 8, borderRadius: (SIZE - 8) / 2, backgroundColor: colors.action },
});
