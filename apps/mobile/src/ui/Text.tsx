// Text in the app's type styles: the iPhone's own sizes in the system font. Every piece of text in
// the app goes through this, so sizes and weights stay on the scale.

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

/**
 * How far the iPhone's Larger Text setting grows the app's words: well past the standard size, but
 * not so far that the bars, buttons and rows cut them off.
 */
export const TEXT_LARGEST = 1.4;

export function Text({ variant = 'body', color = colors.label, weight, tabular, align, style, ...props }: AppTextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={TEXT_LARGEST}
      {...props}
      style={[
        typeScale[variant],
        { color },
        weight ? { fontWeight: weight } : null,
        tabular || variant === 'mono' ? { fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
