// The look of the app: Apple's iOS system colors and type sizes (light appearance), with
// Ross Built blue as the one accent. Status colors come in two strengths: the bright system
// color for fills and icons, and Apple's increased contrast version for text, so it reads
// outdoors on a job site.

import type { TextStyle } from 'react-native';

export const brand = {
  ink: '#3B5864',
  blue: '#4E7A8C',
  rule: '#5B8699',
  hairline: '#CBD8DB',
  cream: '#F7F5EC',
} as const;

export const colors = {
  tint: brand.blue,
  tintPressed: '#3E6676',
  tintSoft: 'rgba(78, 122, 140, 0.14)',

  background: '#FFFFFF',
  grouped: '#F2F2F7',
  cell: '#FFFFFF',
  elevated: '#FFFFFF',

  label: '#000000',
  secondary: 'rgba(60, 60, 67, 0.6)',
  tertiary: 'rgba(60, 60, 67, 0.3)',
  quaternary: 'rgba(60, 60, 67, 0.18)',
  placeholder: 'rgba(60, 60, 67, 0.3)',

  separator: 'rgba(60, 60, 67, 0.29)',
  separatorOpaque: '#C6C6C8',
  fill: 'rgba(120, 120, 128, 0.2)',
  fill2: 'rgba(120, 120, 128, 0.16)',
  fill3: 'rgba(118, 118, 128, 0.12)',
  fill4: 'rgba(116, 116, 128, 0.08)',
  highlight: '#D1D1D6',

  gray: '#8E8E93',
  gray2: '#AEAEB2',
  gray3: '#C7C7CC',
  gray4: '#D1D1D6',
  gray5: '#E5E5EA',
  gray6: '#F2F2F7',

  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  indigo: '#5856D6',
  blue: '#007AFF',
  teal: '#30B0C7',
  purple: '#AF52DE',
  brown: '#A2845E',

  greenText: '#248A3D',
  orangeText: '#C93400',
  redText: '#D70015',
  indigoText: '#3634A3',

  white: '#FFFFFF',
  black: '#000000',
  dim: 'rgba(0, 0, 0, 0.25)',
} as const;

/** Apple's text styles at the default text size. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Layout: list margins, row padding, corner radii. */
export const layout = {
  margin: 16,
  rowPadding: 16,
  rowMinHeight: 52,
  radius: 22,
  tileRadius: 18,
  controlRadius: 10,
  sheetRadius: 22,
  barHeight: 52,
} as const;

/** Motion: one curve for most things, Apple's sheet curve for sheets. Durations stay short. */
export const motion = {
  fast: 150,
  base: 240,
  slow: 420,
  sheet: 480,
} as const;
