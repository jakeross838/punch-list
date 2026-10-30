// Preview page: how a sheet screen (New Item, an item's details) comes up. It is the stack's iOS
// sheet motion with today's iOS proportions: the sheet's corners are rounder, and the screen
// behind it shrinks back with rounded corners all the way around.

import type { StackCardInterpolationProps, StackCardInterpolatedStyle } from 'expo-router/js-stack';
import { Animated } from 'react-native';

const SHEET_RADIUS = 22;
const BEHIND_RADIUS = 16;
const TOP_GAP = 10;

export function forSheetIOS({ index, current, next, inverted, layouts: { screen }, insets }: StackCardInterpolationProps): StackCardInterpolatedStyle {
  const isLandscape = screen.width > screen.height;
  const topOffset = isLandscape ? 0 : TOP_GAP;
  const statusBarHeight = insets.top;
  const aspectRatio = screen.height / screen.width;

  const progress = Animated.add(
    current.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    next ? next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }) : 0,
  );
  const isFirst = index === 0;

  const translateY = Animated.multiply(
    progress.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [screen.height, isFirst ? 0 : topOffset, (isFirst ? statusBarHeight : 0) - topOffset * aspectRatio],
    }),
    inverted,
  );
  const overlayOpacity = progress.interpolate({ inputRange: [0, 1, 1.0001, 2], outputRange: [0, 0.3, 1, 1] });
  const scale = isLandscape
    ? 1
    : progress.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1, screen.width ? 1 - (topOffset * 2) / screen.width : 1] });
  const radius = isLandscape
    ? 0
    : progress.interpolate({
        inputRange: [0, 1, 1.0001, 2],
        outputRange: isFirst ? [0, 0, 0, BEHIND_RADIUS] : [SHEET_RADIUS, SHEET_RADIUS, SHEET_RADIUS, BEHIND_RADIUS],
      });

  return {
    cardStyle: {
      overflow: 'hidden',
      borderTopLeftRadius: radius,
      borderTopRightRadius: radius,
      borderBottomLeftRadius: isFirst ? radius : 0,
      borderBottomRightRadius: isFirst ? radius : 0,
      marginTop: isFirst ? 0 : statusBarHeight,
      marginBottom: isFirst ? 0 : topOffset,
      transform: [{ translateY }, { scale }],
    },
    overlayStyle: { opacity: overlayOpacity },
  };
}

// The stack treats a transition as a sheet (keeping the screen behind it on show) by this name,
// so it is set outright rather than left to survive minifying.
Object.defineProperty(forSheetIOS, 'name', { value: 'forModalPresentationIOS' });
