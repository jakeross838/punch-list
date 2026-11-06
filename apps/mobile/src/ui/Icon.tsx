// The app's icons, drawn with SVG the same on the iPhone and on the preview page: Heroicons
// outline, the set the Nightwork design system uses.

import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/constants/theme';
import { ICON_PATHS, STROKES, type IconProps } from './icons';

export function Icon({ name, size = 20, color = colors.label, weight = 'regular', style }: IconProps) {
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d={ICON_PATHS[name]} stroke={color as string} strokeWidth={STROKES[weight]} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}
