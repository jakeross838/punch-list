// iPhone: a link as a code to scan, drawn with react-native-svg, white with a quiet edge so any
// camera finds it.

import { memo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { scanCodePath } from '@/export/scanCode';

export const ScanCode = memo(function ScanCode({ url, size, label }: { url: string; size: number; label: string }) {
  const code = scanCodePath(url);
  if (!code) return null;
  const { n, edge, d } = code;
  return (
    <Svg width={size} height={size} viewBox={`${-edge} ${-edge} ${n + edge * 2} ${n + edge * 2}`} accessibilityLabel={label} accessibilityRole="image">
      <Rect x={-edge} y={-edge} width={n + edge * 2} height={n + edge * 2} fill="#FFFFFF" />
      <Path d={d} fill="#132028" />
    </Svg>
  );
});
