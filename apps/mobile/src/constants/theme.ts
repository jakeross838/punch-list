// The look of the app, as approved on the Punch List App Design canvas: white and light gray,
// black text, and one accent, Ross Built slate blue, for everything you can tap. Red is only for
// removing. No other colors: status is said in words, with a small gray icon where it helps.

import type { TextStyle } from 'react-native';

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

  separator: '#EDEDF0',
  rule: '#E8E8ED',
  track: '#E5E5EA',
  trackOnWhite: '#EDEDF0',
  progressTrack: '#E1E1E6',
  highlight: '#ECECEF',

  destructive: '#D70015',
  white: '#FFFFFF',
  black: '#000000',
  dim: 'rgba(0, 0, 0, 0.22)',

  /** The camera and markup: white on black, with frosted chips. */
  onDark: '#FFFFFF',
  onDarkQuiet: 'rgba(255, 255, 255, 0.72)',
  darkChip: 'rgba(255, 255, 255, 0.16)',
  darkChipOn: 'rgba(255, 255, 255, 0.28)',
} as const;

/** Apple's text styles at the default text size. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4 },
  title1: { fontSize: 28, lineHeight: 32, fontWeight: '600', letterSpacing: -0.4 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Layout: margins, row sizes, corner radii. */
export const layout = {
  margin: 16,
  inset: 20,
  rowPadding: 16,
  rowMinHeight: 50,
  radius: 18,
  barHeight: 44,
} as const;

/** Motion: one curve for most things, Apple's sheet curve for sheets. Durations stay short. */
export const motion = {
  fast: 150,
  base: 240,
  slow: 380,
  sheet: 480,
} as const;
