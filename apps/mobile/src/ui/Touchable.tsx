// Press feedback the way iOS does it. Rows light up gray the instant you touch them and fade back
// when you let go; buttons and tiles press in slightly; bar buttons dim. A short delay before the
// press shows keeps rows from flashing while you scroll. The same code animates on the iPhone and
// on the preview page.

import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, type ColorValue, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';
import { colors, motion } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Decelerates like a real object. Used for nearly every transition. */
export const easeOut = cubicBezier(0.23, 1, 0.32, 1);
/** Apple's sheet curve. */
export const easeSheet = cubicBezier(0.32, 0.72, 0, 1);

export type Feedback = 'highlight' | 'scale' | 'opacity' | 'none';

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  feedback?: Feedback;
  highlightColor?: ColorValue;
  /** Milliseconds to wait before the press shows. Use on rows inside a scrolling list. */
  pressDelay?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function pressDelayProps(delay: number): object {
  if (delay <= 0) return {};
  return Platform.OS === 'web' ? { delayPressIn: delay } : { unstable_pressDelay: delay };
}

export function Touchable({
  feedback = 'opacity',
  highlightColor = colors.highlight,
  pressDelay = 0,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: TouchableProps) {
  const [pressed, setPressed] = useState(false);
  const down = pressed && !disabled;

  const feedbackStyle =
    feedback === 'scale'
      ? {
          transform: [{ scale: down ? 0.96 : 1 }],
          transitionProperty: 'transform' as const,
          transitionDuration: down ? motion.fast : motion.base,
          transitionTimingFunction: easeOut,
        }
      : feedback === 'opacity'
        ? {
            opacity: down ? 0.35 : 1,
            transitionProperty: 'opacity' as const,
            transitionDuration: down ? 0 : motion.base,
            transitionTimingFunction: easeOut,
          }
        : feedback === 'highlight'
          ? { overflow: 'hidden' as const }
          : null;

  return (
    <AnimatedPressable
      {...rest}
      {...pressDelayProps(pressDelay)}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[style, feedbackStyle, disabled ? styles.disabled : null]}
    >
      {feedback === 'highlight' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: highlightColor,
              opacity: down ? 1 : 0,
              transitionProperty: 'opacity',
              transitionDuration: down ? 0 : 320,
              transitionTimingFunction: 'ease-out',
            },
          ]}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.4 },
});
