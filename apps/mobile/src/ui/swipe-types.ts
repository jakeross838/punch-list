import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { IconName } from './icons';

export interface SwipeAction {
  label: string;
  icon: IconName;
  color: string;
  onPress: () => void;
  testID?: string;
}

export interface SwipeRowProps {
  /** Shown from the right when the row is swiped left, first one at the left. */
  actions: SwipeAction[];
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const ACTION_WIDTH = 78;
