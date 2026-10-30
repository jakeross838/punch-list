// Text in Apple's type styles. Every piece of text in the app goes through this, so sizes and
// weights stay on the system scale.

import { Text as RNText, type ColorValue, type TextProps, type TextStyle } from 'react-native';
import { colors, type as typeScale, type TypeVariant } from '@/constants/theme';

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
        weight ? { fontWeight: weight } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
