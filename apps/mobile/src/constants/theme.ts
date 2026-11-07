// The look of the app: the way the iPhone's own apps look, so it feels familiar from the first
// tap. Light gray pages with white rounded cards, the system font in plain sentence case, blue for
// anything that can be tapped, green for ready and done, red for late and removing. Bars are light;
// the camera, markup and the toast stay dark, as on the iPhone.

import { Platform, StyleSheet, type TextStyle } from 'react-native';

export const colors = {
  /** Links, tappable text and tinted icons. */
  tint: '#007AFF',
  tintPressed: '#0062CC',
  /** Filled buttons, the selected chip and checked boxes. */
  action: '#007AFF',
  actionPressed: '#0062CC',
  /** Dark surfaces: the camera, markup, the toast and the selection bar. */
  bar: '#1C1C1E',
  /** Words and icons on something dark or filled. */
  onBar: '#FFFFFF',
  onBarQuiet: 'rgba(235, 235, 245, 0.6)',
  onBarEdge: 'rgba(255, 255, 255, 0.22)',
  /** The accent on something dark: the toast's action. */
  oceanside: '#0A84FF',
  /** Progress, and the avatar behind initials. */
  stone: '#8E8E93',

  background: '#F2F2F7',
  grouped: '#F2F2F7',
  cell: '#FFFFFF',
  surface: '#E5E5EA',
  /** No striped rows: the iPhone's lists are plain. */
  stripe: 'transparent',

  label: '#000000',
  secondary: '#6C6C70',
  placeholder: '#8E8E93',
  chevron: '#C4C4C7',
  /** The edge of an unchecked circle or box, and quiet status icons. */
  circle: '#AEAEB2',
  quiet: '#AEAEB2',

  separator: '#C6C6C8',
  rule: '#C6C6C8',
  border: 'rgba(60, 60, 67, 0.18)',
  borderStrong: 'rgba(60, 60, 67, 0.29)',
  track: '#E5E5EA',
  trackOnWhite: '#E5E5EA',
  progressTrack: '#E5E5EA',
  highlight: '#E5E5EA',
  chip: 'rgba(118, 118, 128, 0.12)',
  chipOn: '#007AFF',

  ok: '#248A3D',
  okFill: '#34C759',
  /** Waiting on something: the Waiting tile on a job. */
  waiting: '#FF9500',
  destructive: '#FF3B30',
  white: '#FFFFFF',
  black: '#000000',
  dim: 'rgba(0, 0, 0, 0.4)',

  /**
   * The schedule's bars, in the colors the companies already know from the weekly schedule: green
   * is confirmed, blue is our best guess, and a pale bar with a dashed edge still moves with the list.
   */
  confirmed: '#34C759',
  bestGuess: '#007AFF',
  moving: '#E5F0FF',

  /** The camera and markup: white on near black, with dark glass controls. */
  onDark: '#FFFFFF',
  onDarkQuiet: 'rgba(235, 235, 245, 0.6)',
  darkChip: 'rgba(28, 28, 30, 0.72)',
  darkChipOn: 'rgba(255, 255, 255, 0.24)',
} as const;

/** The system font: San Francisco on the iPhone, the same on the preview page in Safari. */
const SYSTEM_FONT = Platform.OS === 'web' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' : undefined;

type Weight = '400' | '500' | '600' | '700';

interface Style {
  fontSize: number;
  lineHeight: number;
  weight: Weight;
  letterSpacing?: number;
}

/** The iPhone's own text sizes. */
const styles = {
  largeTitle: { fontSize: 34, lineHeight: 41, weight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, weight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, weight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, weight: '600', letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, weight: '600', letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, weight: '400', letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, weight: '400', letterSpacing: -0.32 },
  subheadline: { fontSize: 15, lineHeight: 20, weight: '400', letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, weight: '400', letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, weight: '400', letterSpacing: 0 },
  /** A sheet's title, in its bar. */
  sheetTitle: { fontSize: 17, lineHeight: 22, weight: '600', letterSpacing: -0.41 },
  /** The big numbers in the counts on the job. */
  figure: { fontSize: 28, lineHeight: 34, weight: '700', letterSpacing: 0.36 },
  /** Section headers and the names of fields. */
  label: { fontSize: 13, lineHeight: 18, weight: '400', letterSpacing: -0.08 },
  /** The line above a title. */
  eyebrow: { fontSize: 13, lineHeight: 18, weight: '400', letterSpacing: -0.08 },
  /** Small tags and captions: Ready, Waiting, a count on a button. */
  stamp: { fontSize: 12, lineHeight: 16, weight: '600', letterSpacing: 0 },
  /** Button words. */
  button: { fontSize: 17, lineHeight: 22, weight: '400', letterSpacing: -0.41 },
  /** Numbers that line up: counts, item numbers, times. */
  mono: { fontSize: 15, lineHeight: 20, weight: '400', letterSpacing: -0.24 },
} as const satisfies Record<string, Style>;

export type TypeVariant = keyof typeof styles;

function toTextStyle(s: Style): TextStyle {
  return {
    ...(SYSTEM_FONT ? { fontFamily: SYSTEM_FONT } : null),
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    fontWeight: s.weight,
    ...(s.letterSpacing !== undefined ? { letterSpacing: s.letterSpacing } : null),
  };
}

type Ready = TextStyle & { fontSize: number; lineHeight: number };

/** The text styles, ready to spread into a style. */
export const type = Object.fromEntries(Object.entries(styles).map(([k, s]) => [k, toTextStyle(s)])) as Record<TypeVariant, Ready>;

/**
 * A text style for a one-line text field: the size and face without the line height. On the
 * iPhone a one-line field with a line height draws its text off center, and the words jump as you
 * type. Fields that wrap keep the line height.
 */
export function fieldFont(variant: TypeVariant): TextStyle {
  const { lineHeight: _lineHeight, ...rest } = type[variant];
  return rest;
}

/** Layout: margins, row sizes and the rounded corners of cards, buttons and fields. */
export const layout = {
  margin: 16,
  inset: 20,
  rowPadding: 16,
  rowMinHeight: 44,
  /** Cards, lists and fields. */
  radius: 10,
  /** Buttons. */
  buttonRadius: 12,
  barHeight: 44,
  /** Lines between rows and around fields: the thinnest line the screen can draw. */
  hairline: StyleSheet.hairlineWidth,
  fine: StyleSheet.hairlineWidth,
} as const;

/** Motion: instant, working pace. Short eases, no bounce. */
export const motion = {
  fast: 120,
  base: 150,
  slow: 200,
  sheet: 320,
} as const;
