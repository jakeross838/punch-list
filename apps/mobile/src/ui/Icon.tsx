// iPhone: SF Symbols, drawn by the system.

import { SymbolView } from 'expo-symbols';
import { colors } from '@/constants/theme';
import { SF_SYMBOLS, type IconProps } from './icons';

export function Icon({ name, size = 20, color = colors.label, weight = 'regular', style }: IconProps) {
  return (
    <SymbolView
      name={SF_SYMBOLS[name]}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={[{ width: size, height: size }, style]}
    />
  );
}
