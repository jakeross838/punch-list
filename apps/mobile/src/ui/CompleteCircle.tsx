// The circle at the start of an item, like Reminders. Tap it to check the item off: it fills with
// the accent and the checkmark pops in.

import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { Icon } from './Icon';
import { easeOut } from './Touchable';

const SIZE = 24;

const pop = {
  '0%': { transform: [{ scale: 1 }] },
  '40%': { transform: [{ scale: 1.18 }] },
  '100%': { transform: [{ scale: 1 }] },
};

export function CompleteCircle({
  checked,
  animate,
  onPress,
  label,
  testID,
}: {
  checked: boolean;
  /** Play the pop: only when the tap just happened, not when the list first shows. */
  animate?: boolean;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 10 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      testID={testID}
      style={styles.hit}
    >
      <Animated.View
        style={[
          styles.circle,
          {
            borderColor: checked ? colors.tint : colors.gray3,
            backgroundColor: checked ? colors.tint : 'transparent',
            transitionProperty: ['borderColor', 'backgroundColor'],
            transitionDuration: 180,
            transitionTimingFunction: easeOut,
          },
          checked && animate ? { animationName: pop, animationDuration: 380, animationTimingFunction: easeOut } : null,
        ]}
      >
        <Animated.View
          style={{
            opacity: checked ? 1 : 0,
            transform: [{ scale: checked ? 1 : 0.3 }],
            transitionProperty: ['opacity', 'transform'],
            transitionDuration: 260,
            transitionTimingFunction: easeOut,
          }}
        >
          <Icon name="checkmark" size={14} color={colors.white} weight="bold" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { paddingTop: 1 },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
