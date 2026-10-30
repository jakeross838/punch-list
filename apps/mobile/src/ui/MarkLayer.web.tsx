// Preview page: the marks on a photo, drawn in SVG at the size the photo is shown.

import { markShapes, type Mark } from '@punch/core';
import { memo } from 'react';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Inter, system-ui, sans-serif";

export const MarkLayer = memo(function MarkLayer({ marks, width, height }: { marks: Mark[]; width: number; height: number }) {
  if (marks.length === 0 || width <= 0 || height <= 0) return null;
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, display: 'block', pointerEvents: 'none', overflow: 'visible' }}>
      {marks.flatMap((mark, mi) =>
        markShapes(mark, width, height).map((s, si) => {
          const key = `${mi}-${si}`;
          switch (s.type) {
            case 'path':
              return <path key={key} d={s.d} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
            case 'ellipse':
              return <ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} stroke={s.stroke} strokeWidth={s.strokeWidth} fill={s.fill ?? 'none'} />;
            case 'rect':
              return <rect key={key} x={s.x} y={s.y} width={s.width} height={s.height} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinejoin="round" fill="none" />;
            case 'text':
              return (
                <text
                  key={key}
                  x={s.x}
                  y={s.y}
                  fill={s.fill}
                  fontSize={s.fontSize}
                  fontWeight={700}
                  fontFamily={FONT}
                  textAnchor={s.anchor ?? 'start'}
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  strokeLinejoin="round"
                >
                  {s.text}
                </text>
              );
          }
        }),
      )}
    </svg>
  );
});
