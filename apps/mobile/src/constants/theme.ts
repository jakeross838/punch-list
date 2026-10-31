// The look of the app, as approved on the Punch List App Design canvas: white and light gray,
// black text, and one accent, Ross Built slate blue, for everything you can tap. Red is only for
// removing and for what is late. No other colors: status is said in words, with a small gray icon
// where it helps. Kept crisp: text a step smaller than the iPhone's default, rows tight, hairlines
// thin and corners tighter, so a screen holds more of the list and every row says more.

import { StyleSheet, type TextStyle } from 'react-native';

export const brand = {
  slate: '#3E5964',
  coastal: '#5D8394',
  paleBlue: '#CBD6D9',
  cream: '#F2EFE6',
} as const;

export const colors = {
  tint: brand.slate,
  tintPressed: '#2C414A',

  background: '#FFFFFF',
  grouped: '#F5F5F7',
  cell: '#FFFFFF',
  surface: '#F5F5F7',

  label: '#1D1D1F',
  secondary: '#6E6E73',
  placeholder: '#8E8E93',
  chevron: '#C7C7CC',
  /** The ring of an unchecked circle, and quiet status icons like the hourglass. */
  circle: '#AEAEB2',
  quiet: '#8E8E93',

  /** Hairlines between rows: thin, so a little darker. */
  separator: '#E3E3E8',
  rule: '#DEDEE3',
  track: '#E5E5EA',
  trackOnWhite: '#EDEDF0',
  progressTrack: '#E1E1E6',
  highlight: '#ECECEF',
  /** A quiet label or chip on white. */
  chip: '#F0F0F3',
  chipOn: '#E3E9EC',

  destructive: '#D70015',
  white: '#FFFFFF',
  black: '#000000',
  dim: 'rgba(0, 0, 0, 0.22)',

  /**
   * The schedule's bars, in the colors the companies already know from the weekly schedule: green
   * is confirmed, blue is our best guess, and a pale blue bar is a best guess that still moves with
   * the list.
   */
  confirmed: '#4E7F5E',
  bestGuess: brand.coastal,
  moving: '#DCE5E8',

  /** The camera and markup: white on black, with frosted chips. */
  onDark: '#FFFFFF',
  onDarkQuiet: 'rgba(255, 255, 255, 0.72)',
  darkChip: 'rgba(255, 255, 255, 0.16)',
  darkChipOn: 'rgba(255, 255, 255, 0.28)',
} as const;

/** Apple's text styles one step under the default text size (the Small setting): crisper, more on screen. */
export const type = {
  largeTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5 },
  title1: { fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.4 },
  title2: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: -0.3 },
  title3: { fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.2 },
  headline: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  callout: { fontSize: 14, lineHeight: 19, fontWeight: '400' },
  subheadline: { fontSize: 13, lineHeight: 17, fontWeight: '400' },
  footnote: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption1: { fontSize: 11, lineHeight: 13, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Layout: margins, row sizes, corner radii. */
export const layout = {
  margin: 16,
  inset: 16,
  rowPadding: 14,
  rowMinHeight: 44,
  radius: 12,
  barHeight: 44,
  /** A thin line: a third of a point on the iPhone, half a pixel on the preview. */
  hairline: StyleSheet.hairlineWidth < 1 ? StyleSheet.hairlineWidth : 0.5,
} as const;

/** Motion: one curve for most things, Apple's sheet curve for sheets. Durations stay short. */
export const motion = {
  fast: 150,
  base: 240,
  slow: 380,
  sheet: 480,
} as const;
