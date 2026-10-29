// Ross Built house colors, from the house document standard.
export const colors = {
  ink: '#3B5864',
  blue: '#4E7A8C',
  rule: '#5B8699',
  hairline: '#CBD8DB',
  cream: '#F7F5EC',
  white: '#FFFFFF',
  page: '#FBFAF6',
  good: '#2E7D4F',
  warn: '#8A6D1D',
  danger: '#B3261E',
  muted: '#6B7B83',
} as const;

export const space = (n: number): number => n * 8;

export const type = {
  title: 20,
  heading: 17,
  body: 16,
  small: 13,
} as const;
