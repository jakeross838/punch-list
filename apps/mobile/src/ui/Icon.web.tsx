// Preview page: simple line icons drawn in SVG, sized and weighted like SF Symbols.

import type { ReactElement } from 'react';
import { View } from 'react-native';
import { colors } from '@/constants/theme';
import type { IconName, IconProps, IconWeight } from './icons';

const WEIGHT: Record<IconWeight, number> = { regular: 1, medium: 1.12, semibold: 1.25, bold: 1.4 };

type Draw = (c: string, w: number) => ReactElement;

const line = (d: string, c: string, w: number) => (
  <path d={d} stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
);
const solid = (d: string, c: string) => <path d={d} fill={c} />;
const dot = (cx: number, cy: number, r: number, c: string) => <circle cx={cx} cy={cy} r={r} fill={c} />;
const ring = (cx: number, cy: number, r: number, c: string, w: number) => (
  <circle cx={cx} cy={cy} r={r} stroke={c} strokeWidth={w} fill="none" />
);

const GLYPHS: Record<IconName, Draw> = {
  'chevron.right': (c, w) => line('M9 5.5L15.5 12 9 18.5', c, w * 2.1),
  'chevron.left': (c, w) => line('M15 5.5L8.5 12 15 18.5', c, w * 2.1),
  'chevron.down': (c, w) => line('M5.5 9L12 15.5 18.5 9', c, w * 2.1),
  'chevron.up.chevron.down': (c, w) => line('M8 9.5l4-4 4 4M8 14.5l4 4 4-4', c, w * 2),
  plus: (c, w) => line('M12 5v14M5 12h14', c, w * 2.1),
  'plus.circle.fill': (c, w) => (
    <>
      {dot(12, 12, 10, c)}
      {line('M12 7.5v9M7.5 12h9', '#FFFFFF', w * 2.1)}
    </>
  ),
  ellipsis: (c) => (
    <>
      {dot(5.5, 12, 1.9, c)}
      {dot(12, 12, 1.9, c)}
      {dot(18.5, 12, 1.9, c)}
    </>
  ),
  'ellipsis.circle': (c, w) => (
    <>
      {ring(12, 12, 9.6, c, w * 1.6)}
      {dot(7.6, 12, 1.35, c)}
      {dot(12, 12, 1.35, c)}
      {dot(16.4, 12, 1.35, c)}
    </>
  ),
  checkmark: (c, w) => line('M5 12.5l4.6 4.6L19.2 7.4', c, w * 2.3),
  xmark: (c, w) => line('M6.5 6.5l11 11M17.5 6.5l-11 11', c, w * 2.1),
  'xmark.circle.fill': (c, w) => (
    <>
      {dot(12, 12, 10, c)}
      {line('M8.8 8.8l6.4 6.4M15.2 8.8l-6.4 6.4', '#FFFFFF', w * 2)}
    </>
  ),
  magnifyingglass: (c, w) => (
    <>
      {ring(10.5, 10.5, 6.5, c, w * 2)}
      {line('M15.4 15.4L20.5 20.5', c, w * 2.2)}
    </>
  ),
  'house.fill': (c) =>
    solid(
      'M3.2 11.2L12 3.8l8.8 7.4c.3.3.2.8-.2.8H19v7.5c0 .8-.7 1.5-1.5 1.5H15v-5.5h-6V21H6.5C5.7 21 5 20.3 5 19.5V12H3.4c-.4 0-.5-.5-.2-.8z',
      c,
    ),
  door: (c, w) => (
    <>
      {line('M6.5 21V4.8c0-.9.7-1.6 1.6-1.6h7.8c.9 0 1.6.7 1.6 1.6V21M4.5 21h15', c, w * 1.9)}
      {dot(14.4, 12.3, 1.2, c)}
    </>
  ),
  'person.2.fill': (c) => (
    <>
      {dot(9, 7.6, 3.4, c)}
      {solid('M2.8 19.2c0-3.6 2.8-6.1 6.2-6.1s6.2 2.5 6.2 6.1c0 .5-.4.8-.8.8H3.6c-.4 0-.8-.3-.8-.8z', c)}
      {dot(16.7, 8.4, 2.7, c)}
      {solid('M16.4 12.9c2.9.2 4.9 2.4 4.9 5.6 0 .5-.4.8-.8.8h-3.8c.3-2.8-.4-4.8-1.9-6.3.5-.1 1-.1 1.6-.1z', c)}
    </>
  ),
  wrench: (c) => solid('M20.2 6.1l-3 3-2.6-.7-.7-2.6 3-3a5 5 0 0 0-6.4 6.3L4 15.6a2.1 2.1 0 1 0 3 3l6.5-6.5a5 5 0 0 0 6.7-6z', c),
  hourglass: (c, w) =>
    line(
      'M7 3.5h10M7 20.5h10M8 3.5v2.8c0 1.6.8 3 2.2 3.9L12 11.4l1.8-1.2A4.6 4.6 0 0 0 16 6.3V3.5M8 20.5v-2.8c0-1.6.8-3 2.2-3.9l1.8-1.2 1.8 1.2a4.6 4.6 0 0 1 2.2 3.9v2.8',
      c,
      w * 1.8,
    ),
  calendar: (c, w) => (
    <>
      <rect x={3.5} y={5} width={17} height={15.5} rx={2.6} stroke={c} strokeWidth={w * 1.8} fill="none" />
      {line('M3.5 10h17M8 3v4M16 3v4', c, w * 1.8)}
    </>
  ),
  'checkmark.circle.fill': (c, w) => (
    <>
      {dot(12, 12, 10, c)}
      {line('M7.6 12.3l3 3 5.8-6', '#FFFFFF', w * 2.2)}
    </>
  ),
  slider: (c, w) => (
    <>
      {line('M4 7h16M4 12h16M4 17h16', c, w * 1.8)}
      {dot(15, 7, 2.5, c)}
      {dot(8.5, 12, 2.5, c)}
      {dot(13, 17, 2.5, c)}
    </>
  ),
  grid: (c, w) => (
    <>
      <rect x={4} y={4} width={6.5} height={6.5} rx={1.7} stroke={c} strokeWidth={w * 1.8} fill="none" />
      <rect x={13.5} y={4} width={6.5} height={6.5} rx={1.7} stroke={c} strokeWidth={w * 1.8} fill="none" />
      <rect x={4} y={13.5} width={6.5} height={6.5} rx={1.7} stroke={c} strokeWidth={w * 1.8} fill="none" />
      <rect x={13.5} y={13.5} width={6.5} height={6.5} rx={1.7} stroke={c} strokeWidth={w * 1.8} fill="none" />
    </>
  ),
  eye: (c, w) => (
    <>
      {line('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', c, w * 1.8)}
      {ring(12, 12, 3.2, c, w * 1.8)}
    </>
  ),
  'eye.slash': (c, w) => (
    <>
      {line('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', c, w * 1.8)}
      {ring(12, 12, 3.2, c, w * 1.8)}
      {line('M4 4l16 16', c, w * 1.8)}
    </>
  ),
  trash: (c, w) =>
    line(
      'M4.5 6.5h15M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.5 6.5l.9 12.6c.1.8.8 1.4 1.6 1.4h6c.8 0 1.5-.6 1.6-1.4l.9-12.6M10 10.5v6M14 10.5v6',
      c,
      w * 1.7,
    ),
  undo: (c, w) => line('M9 14.5L4.5 10 9 5.5M4.5 10h10a5 5 0 0 1 0 10H12', c, w * 2),
  clipboard: (c, w) => (
    <>
      {line('M9 4.5H7.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2H15', c, w * 1.8)}
      <rect x={9} y={3} width={6} height={3.2} rx={1} stroke={c} strokeWidth={w * 1.8} fill="none" />
      {line('M9 11h6M9 15h4', c, w * 1.8)}
    </>
  ),
  'info.circle': (c, w) => (
    <>
      {ring(12, 12, 9.2, c, w * 1.8)}
      {line('M12 10.8v6', c, w * 2)}
      {dot(12, 7.6, 1.25, c)}
    </>
  ),
  'exclamationmark.circle.fill': (c, w) => (
    <>
      {dot(12, 12, 10, c)}
      {line('M12 7v6.2', '#FFFFFF', w * 2.2)}
      {dot(12, 16.6, 1.3, '#FFFFFF')}
    </>
  ),
  'list.bullet': (c, w) => (
    <>
      {dot(5, 6.5, 1.6, c)}
      {dot(5, 12, 1.6, c)}
      {dot(5, 17.5, 1.6, c)}
      {line('M9.5 6.5h10M9.5 12h10M9.5 17.5h10', c, w * 1.9)}
    </>
  ),
  number: (c, w) => line('M10 4L8 20M16 4l-2 16M4.5 9h15M4 15h15', c, w * 1.9),
  cart: (c, w) => (
    <>
      {line('M2.5 4h2.2c.5 0 .9.3 1 .8L8 15.2c.1.5.5.8 1 .8h8.6c.5 0 .9-.3 1-.8l1.8-7.4c.2-.6-.3-1.3-1-1.3H6.4', c, w * 1.8)}
      {dot(9.5, 19.6, 1.6, c)}
      {dot(17, 19.6, 1.6, c)}
    </>
  ),
  'plus.app.fill': (c, w) => (
    <>
      <rect x={3} y={3} width={18} height={18} rx={5} fill={c} />
      {line('M12 7.5v9M7.5 12h9', '#FFFFFF', w * 2)}
    </>
  ),
  'minus.circle.fill': (c, w) => (
    <>
      {dot(12, 12, 10, c)}
      {line('M7.5 12h9', '#FFFFFF', w * 2.2)}
    </>
  ),
  building: (c, w) => (
    <>
      {line('M4.5 21V5.2c0-.7.5-1.2 1.2-1.2h7.1c.7 0 1.2.5 1.2 1.2V21M14 9h4.3c.7 0 1.2.5 1.2 1.2V21M2.5 21h19', c, w * 1.8)}
      {line('M8 8h3M8 12h3M8 16h3M16.5 13h.5M16.5 17h.5', c, w * 1.8)}
    </>
  ),
  camera: (c, w) => (
    <>
      {line('M3.5 8.5A2.5 2.5 0 0 1 6 6h1.8l1.5-2.2h5.4L16.2 6H18a2.5 2.5 0 0 1 2.5 2.5V17a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 17z', c, w * 1.8)}
      {ring(12, 12.8, 3.6, c, w * 1.8)}
    </>
  ),
  'photo.on.rectangle': (c, w) => (
    <>
      <rect x={3.5} y={5} width={17} height={14} rx={2.5} stroke={c} strokeWidth={w * 1.8} fill="none" />
      {ring(9, 10, 1.6, c, w * 1.6)}
      {line('M20.5 15.5L16 11l-8.5 8', c, w * 1.8)}
    </>
  ),
  bolt: (c, w) => line('M13.5 3L6.5 13h5l-1 8 7-10h-5z', c, w * 1.8),
  'bolt.slash': (c, w) => (
    <>
      {line('M13.5 3L6.5 13h5l-1 8 7-10h-5z', c, w * 1.8)}
      {line('M4 4l16 16', c, w * 1.8)}
    </>
  ),
  'pencil.tip': (c, w) => (
    <>
      {line('M4.5 19.5l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9.1 18.3z', c, w * 1.8)}
      {line('M14 6.6l3.4 3.4', c, w * 1.8)}
    </>
  ),
  'arrow.up.right': (c, w) => line('M5.5 18.5L18.5 5.5M9.5 5.5h9v9', c, w * 1.9),
  circle: (c, w) => <ellipse cx={12} cy={12} rx={8.5} ry={7} stroke={c} strokeWidth={w * 1.8} fill="none" />,
  square: (c, w) => <rect x={4.5} y={6} width={15} height={12} rx={1.5} stroke={c} strokeWidth={w * 1.8} fill="none" />,
  clock: (c, w) => (
    <>
      {line('M4.6 13.6A7.6 7.6 0 1 0 6.2 7.2', c, w * 1.7)}
      {line('M3.4 4.6l2.8 2.6 3-1.9', c, w * 1.7)}
      {line('M12 8.4V12.6l2.9 1.8', c, w * 1.7)}
    </>
  ),
  ruler: (c, w) => (
    <>
      <rect x={2.5} y={7.5} width={19} height={9} rx={1.5} stroke={c} strokeWidth={w * 1.7} fill="none" />
      {line('M6.5 7.5v3.2M10 7.5v4.6M13.5 7.5v3.2M17 7.5v4.6', c, w * 1.5)}
    </>
  ),
  '1.circle': (c, w) => (
    <>
      {ring(12, 12, 9.4, c, w * 1.7)}
      {line('M10 9.3l2.4-1.8v9', c, w * 1.9)}
    </>
  ),
  textformat: (c, w) => line('M5.5 6.5h13M12 6.5v12', c, w * 1.9),
  rooms: (c, w) => (
    <>
      <rect x={3.5} y={3.5} width={17} height={17} rx={2.5} stroke={c} strokeWidth={w * 1.7} fill="none" />
      {line('M3.5 11.5H11V3.5M11 11.5v9M11 15.5h9.5', c, w * 1.7)}
    </>
  ),
  filter: (c, w) => line('M4 7h16M7 12h10M10 17h4', c, w * 1.8),
  checklist: (c, w) => (
    <>
      {line('M10 6.5h10M10 12h10M10 17.5h10', c, w * 1.8)}
      {line('M3.5 6.6l1.4 1.4 2.4-2.8M3.5 12.1l1.4 1.4 2.4-2.8M3.5 17.6l1.4 1.4 2.4-2.8', c, w * 1.6)}
    </>
  ),
  share: (c, w) => (
    <>
      {line('M12 3.5v11M8 7.2l4-3.9 4 3.9', c, w * 1.8)}
      {line('M8.5 10.5H6.8a1.8 1.8 0 0 0-1.8 1.8v6.4a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8v-6.4a1.8 1.8 0 0 0-1.8-1.8h-1.7', c, w * 1.8)}
    </>
  ),
  sparkles: (c, w) => (
    <>
      {line('M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6z', c, w * 1.6)}
      {line('M17.5 13.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z', c, w * 1.4)}
    </>
  ),
  'calendar.badge.clock': (c, w) => (
    <>
      {line('M8 3.5v3M16 3.5v3M4 9.5h16M6 5h12a2 2 0 0 1 2 2v4.5M4 7a2 2 0 0 1 2-2M4 7v11a2 2 0 0 0 2 2h5', c, w * 1.7)}
      {ring(17, 17, 4, c, w * 1.6)}
      {line('M17 15.2V17l1.3 1', c, w * 1.5)}
    </>
  ),
  timer: (c, w) => (
    <>
      {ring(12, 13.2, 7.6, c, w * 1.7)}
      {line('M12 13.2V9.2M9.8 3.2h4.4M12 3.2v2.4', c, w * 1.7)}
    </>
  ),
  doc: (c, w) => (
    <>
      {line('M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z', c, w * 1.7)}
      {line('M14 3.5V8h4.5M8.8 12.5h6.4M8.8 16h6.4', c, w * 1.7)}
    </>
  ),
};

export function Icon({ name, size = 20, color = colors.label, weight = 'regular', style }: IconProps) {
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        {GLYPHS[name](String(color), WEIGHT[weight])}
      </svg>
    </View>
  );
}
