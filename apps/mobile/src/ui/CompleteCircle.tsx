// The box at the start of an item: tap it to check the item off. It fills slate deep and the check
// comes in; nothing grows or bounces. (Still named for the circle it used to be.)

import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';
import { Icon } from './Icon';
import { easeOut } from './Touchable';

const SIZE = 22;

export function CompleteCircle({
  checked,
  onPress,
  label,
  testID,
}: {
  checked: boolean;
  /** Kept for the screens that pass it: the box no longer pops. */
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
          styles.box,
          {
            borderColor: checked ? colors.action : colors.quiet,
            backgroundColor: checked ? colors.action : colors.cell,
            transitionProperty: ['borderColor', 'backgroundColor'],
            transitionDuration: motion.base,
            transitionTimingFunction: easeOut,
          },
        ]}
      >
        <Animated.View
          style={{
            opacity: checked ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: motion.slow,
            transitionTimingFunction: easeOut,
          }}
        >
          <Icon name="checkmark" size={15} color={colors.onBar} weight="bold" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { paddingTop: 1 },
  box: { width: SIZE, height: SIZE, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
