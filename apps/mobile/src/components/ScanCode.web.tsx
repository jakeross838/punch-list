// Preview page: a link as a code to scan, drawn in SVG, white with a quiet edge so any camera finds it.

import { memo } from 'react';
import { scanCodePath } from '@/export/scanCode';

export const ScanCode = memo(function ScanCode({ url, size, label }: { url: string; size: number; label: string }) {
  const code = scanCodePath(url);
  if (!code) return null;
  const { n, edge, d } = code;
  return (
    <svg width={size} height={size} viewBox={`${-edge} ${-edge} ${n + edge * 2} ${n + edge * 2}`} role="img" aria-label={label} shapeRendering="crispEdges" style={{ display: 'block' }}>
      <rect x={-edge} y={-edge} width={n + edge * 2} height={n + edge * 2} fill="#FFFFFF" />
      <path d={d} fill="#132028" />
    </svg>
  );
});
