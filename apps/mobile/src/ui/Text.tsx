// Text in the Site Office type styles. Every piece of text in the app goes through this, so sizes,
// faces and weights stay on the scale: Space Grotesk titles, Inter for reading, JetBrains Mono in
// capitals for labels and stamps. A weight picks the face's file for that weight, since custom
// fonts do not change weight with fontWeight.

import { Text as RNText, type ColorValue, type TextProps, type TextStyle } from 'react-native';
import { colors, faceOf, fontOf, type as typeScale, type TypeVariant } from '@/constants/theme';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: ColorValue;
  weight?: TextStyle['fontWeight'];
  /** Numbers that line up in columns: counts, item numbers. */
  tabular?: boolean;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color = colors.label, weight, tabular, align, style, ...props }: AppTextProps) {
  return (
    <RNText
      {...props}
      style={[
        typeScale[variant],
        { color },
        weight ? { fontFamily: fontOf(faceOf(variant), weight) } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
