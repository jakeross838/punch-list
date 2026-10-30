// iPhone: the marks on a photo, drawn with react-native-svg at the size the photo is shown.

import { markShapes, type Mark } from '@punch/core';
import { memo } from 'react';
import Svg, { Ellipse, Path, Rect, Text as SvgText } from 'react-native-svg';

export const MarkLayer = memo(function MarkLayer({ marks, width, height }: { marks: Mark[]; width: number; height: number }) {
  if (marks.length === 0 || width <= 0 || height <= 0) return null;
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {marks.flatMap((mark, mi) =>
        markShapes(mark, width, height).map((s, si) => {
          const key = `${mi}-${si}`;
          switch (s.type) {
            case 'path':
              return <Path key={key} d={s.d} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
            case 'ellipse':
              return <Ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} stroke={s.stroke} strokeWidth={s.strokeWidth} fill="none" />;
            case 'rect':
              return <Rect key={key} x={s.x} y={s.y} width={s.width} height={s.height} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinejoin="round" fill="none" />;
            case 'text':
              return (
                <SvgText key={key} x={s.x} y={s.y} fill={s.fill} fontSize={s.fontSize} fontWeight="700">
                  {s.text}
                </SvgText>
              );
          }
        }),
      )}
    </Svg>
  );
});
