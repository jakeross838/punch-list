// iPhone: swipe a row left to show its actions, with the gesture handler's native tracking.

import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors } from '@/constants/theme';
import { haptic } from './haptics';
import { Icon } from './Icon';
import { Text } from './Text';
import { ACTION_WIDTH, type SwipeRowProps } from './swipe-types';

export type { SwipeAction, SwipeRowProps } from './swipe-types';

export function SwipeRow({ actions, children, style }: SwipeRowProps) {
  const ref = useRef<SwipeableMethods>(null);
  if (actions.length === 0) return <View style={style}>{children}</View>;
  return (
    <Swipeable
      ref={ref}
      containerStyle={style}
      friction={1}
      overshootRight={false}
      rightThreshold={ACTION_WIDTH / 2}
      onSwipeableWillOpen={() => haptic.tap()}
      renderRightActions={() => (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                ref.current?.close();
                a.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              testID={a.testID}
              style={[styles.action, { backgroundColor: a.color }]}
            >
              <Icon name={a.icon} size={21} color={colors.white} weight="semibold" />
              <Text variant="footnote" weight="600" color={colors.white}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
