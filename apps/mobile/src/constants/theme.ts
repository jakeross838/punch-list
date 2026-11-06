// The look of the app: Nightwork's Site Office direction, from the nightwork-design skill and the
// approved Punch List Redesign canvas. White sand page, white cards with thin slate borders, slate
// deep bars, everything square. Slate tile is the ink for all text (never black); slate deep is the
// action color; gulf blue is for links and live accents; stone blue for progress and rules. Green
// is ready and confirmed, red is late and removing. No other colors. Three typefaces: Space
// Grotesk for titles, Inter for reading, JetBrains Mono in capitals for labels, stamps and numbers.

import { StyleSheet, type TextStyle } from 'react-native';

export const brand = {
  slate: '#3B5864',
  coastal: '#5B8699',
  paleBlue: '#CBD8DB',
  cream: '#F7F5EC',
} as const;

/** The Slate palette, by Nightwork's own names. */
export const slate = {
  tile: '#3B5864',
  deep: '#1A2830',
  deeper: '#132028',
  stone: '#5B8699',
  gulf: '#436A7A',
  oceanside: '#CBD8DB',
  sand: '#F7F5EC',
  /** Secondary text, solid so small text clears 4.5:1 on sand and on white. */
  secondary: '#56707B',
  /** Quiet text on slate deep. */
  onDeepQuiet: '#9DAAB0',
  /** Checkbox and field edges: 3:1 on white. */
  edge: '#7C939C',
  ok: '#3D7A60',
  okFill: '#4A8A6F',
  bad: '#B0554E',
} as const;

export const colors = {
  /** Links, tappable text and tinted icons. */
  tint: slate.gulf,
  tintPressed: '#2E4F5C',
  /** Filled buttons and the selected chip or segment: the ink that stamps the form. */
  action: slate.deep,
  actionPressed: slate.deeper,
  /** The bars at the top and bottom. */
  bar: slate.deep,
  onBar: slate.sand,
  onBarQuiet: slate.onDeepQuiet,
  /** The edge of a square button on the slate bar. */
  onBarEdge: 'rgba(247, 245, 236, 0.22)',
  /** The selected tab's rule and the Updates dot. */
  oceanside: slate.oceanside,
  /** Progress bars, the Capture square, the avatar. */
  stone: slate.stone,

  background: slate.sand,
  grouped: slate.sand,
  cell: '#FFFFFF',
  surface: '#EFECE2',
  /** The ruled-ledger stripe on every other row. */
  stripe: 'rgba(91, 134, 153, 0.06)',

  label: slate.tile,
  secondary: slate.secondary,
  placeholder: slate.edge,
  chevron: '#9AABB2',
  /** The edge of an unchecked box, and quiet status icons. */
  circle: slate.edge,
  quiet: slate.edge,

  separator: 'rgba(59, 88, 100, 0.10)',
  rule: 'rgba(59, 88, 100, 0.15)',
  border: 'rgba(59, 88, 100, 0.15)',
  borderStrong: 'rgba(59, 88, 100, 0.30)',
  track: '#E4E1D6',
  trackOnWhite: '#ECE9DF',
  progressTrack: 'rgba(59, 88, 100, 0.08)',
  highlight: 'rgba(59, 88, 100, 0.07)',
  chip: '#EFECE2',
  chipOn: slate.deep,

  ok: slate.ok,
  okFill: slate.okFill,
  destructive: slate.bad,
  white: '#FFFFFF',
  black: '#000000',
  dim: 'rgba(19, 32, 40, 0.5)',

  /**
   * The schedule's bars, in the colors the companies already know from the weekly schedule: green
   * is confirmed, blue is our best guess, and a pale bar with a dashed edge still moves with the list.
   */
  confirmed: slate.okFill,
  bestGuess: slate.stone,
  moving: '#E6EEF1',

  /** The camera and markup: sand on slate, with dark glass controls. */
  onDark: slate.sand,
  onDarkQuiet: slate.onDeepQuiet,
  darkChip: 'rgba(19, 32, 40, 0.72)',
  darkChipOn: 'rgba(247, 245, 236, 0.22)',
} as const;

/** The font files, by the names they are loaded under (app/_layout.tsx). */
export const fontFiles = {
  inter: { '400': 'Inter_400Regular', '500': 'Inter_500Medium', '600': 'Inter_600SemiBold', '700': 'Inter_700Bold' },
  display: { '400': 'SpaceGrotesk_400Regular', '500': 'SpaceGrotesk_500Medium', '600': 'SpaceGrotesk_600SemiBold', '700': 'SpaceGrotesk_700Bold' },
  mono: { '400': 'JetBrainsMono_400Regular', '500': 'JetBrainsMono_500Medium', '600': 'JetBrainsMono_600SemiBold', '700': 'JetBrainsMono_700Bold' },
} as const;

export type Face = keyof typeof fontFiles;
type Weight = '400' | '500' | '600' | '700';

/** The file for a face at a weight: custom fonts pick their weight by file, not by fontWeight. */
export function fontOf(face: Face, weight: TextStyle['fontWeight'] = '400'): string {
  const w = String(weight === 'normal' ? 400 : weight === 'bold' ? 700 : weight ?? 400);
  const n = Number(w);
  const pick: Weight = n >= 700 ? '700' : n >= 600 ? '600' : n >= 500 ? '500' : '400';
  return fontFiles[face][pick];
}

interface Style {
  face: Face;
  fontSize: number;
  lineHeight: number;
  weight: Weight;
  letterSpacing?: number;
  upper?: boolean;
}

const styles = {
  largeTitle: { face: 'display', fontSize: 28, lineHeight: 32, weight: '500', letterSpacing: -0.56 },
  title1: { face: 'display', fontSize: 24, lineHeight: 28, weight: '500', letterSpacing: -0.48 },
  title2: { face: 'display', fontSize: 20, lineHeight: 24, weight: '500', letterSpacing: -0.4 },
  title3: { face: 'display', fontSize: 18, lineHeight: 22, weight: '500', letterSpacing: -0.3 },
  headline: { face: 'inter', fontSize: 15, lineHeight: 20, weight: '600' },
  body: { face: 'inter', fontSize: 15, lineHeight: 20, weight: '400' },
  callout: { face: 'inter', fontSize: 14, lineHeight: 19, weight: '400' },
  subheadline: { face: 'inter', fontSize: 13, lineHeight: 18, weight: '400' },
  footnote: { face: 'inter', fontSize: 12, lineHeight: 16, weight: '400' },
  caption1: { face: 'inter', fontSize: 11, lineHeight: 13, weight: '400' },
  /** Sheet titles. */
  sheetTitle: { face: 'display', fontSize: 22, lineHeight: 26, weight: '500', letterSpacing: -0.44 },
  /** The big numbers in the counts on the job. */
  figure: { face: 'display', fontSize: 26, lineHeight: 29, weight: '500', letterSpacing: -0.52 },
  /** The signature label: JetBrains Mono in capitals, tracked out. Field labels, section labels. */
  label: { face: 'mono', fontSize: 10, lineHeight: 14, weight: '500', letterSpacing: 1.4, upper: true },
  /** The line above a title: tracked further than a label. */
  eyebrow: { face: 'mono', fontSize: 10, lineHeight: 14, weight: '500', letterSpacing: 1.8, upper: true },
  /** The stamp: smaller, tracked further, for status pills and stamp captions. */
  stamp: { face: 'mono', fontSize: 9, lineHeight: 12, weight: '500', letterSpacing: 1.6, upper: true },
  /** Button text. */
  button: { face: 'mono', fontSize: 11, lineHeight: 14, weight: '500', letterSpacing: 1.32, upper: true },
  /** Numbers and codes in mono: counts, item numbers, times. */
  mono: { face: 'mono', fontSize: 13, lineHeight: 18, weight: '500' },
} as const satisfies Record<string, Style>;

export type TypeVariant = keyof typeof styles;

function toTextStyle(s: Style): TextStyle {
  return {
    fontFamily: fontFiles[s.face][s.weight],
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    ...(s.letterSpacing !== undefined ? { letterSpacing: s.letterSpacing } : null),
    ...(s.upper ? { textTransform: 'uppercase' as const } : null),
  };
}

type Ready = TextStyle & { fontFamily: string; fontSize: number; lineHeight: number };

/** The text styles, ready to spread into a style. */
export const type = Object.fromEntries(Object.entries(styles).map(([k, s]) => [k, toTextStyle(s)])) as Record<TypeVariant, Ready>;

/** Which face a style is set in, so a weight can pick the right file. */
export function faceOf(variant: TypeVariant): Face {
  return styles[variant].face;
}

/**
 * A text style for a one-line text field: the size and face without the line height. On the
 * iPhone a one-line field with a line height draws its text off center, and the words jump as you
 * type. Fields that wrap keep the line height.
 */
export function fieldFont(variant: TypeVariant): TextStyle {
  const { lineHeight: _lineHeight, ...rest } = type[variant];
  return rest;
}

/** Layout: margins, row sizes. Everything is square: no corner radius anywhere but status dots. */
export const layout = {
  margin: 16,
  inset: 20,
  rowPadding: 14,
  rowMinHeight: 48,
  radius: 0,
  barHeight: 52,
  /** Borders are 1 point: Site Office draws its rules, it does not hint at them. */
  hairline: 1,
  /** Lines between rows inside a card: the thinnest line the screen can draw. */
  fine: StyleSheet.hairlineWidth < 1 ? StyleSheet.hairlineWidth * 2 : 1,
} as const;

/** Motion: instant, working pace. Short eases, no bounce. */
export const motion = {
  fast: 120,
  base: 150,
  slow: 200,
  sheet: 320,
} as const;
