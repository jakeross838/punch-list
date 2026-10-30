// Markup on a photo, made for the job site: pen lines, arrows, circles, boxes, measurements with
// their size written out, numbered spots and short notes. Marks are stored as points on the photo
// (fractions of its width and height), drawn over it at any size, and never burned into the
// picture, so the original is always kept and a mark can be undone later. Notes, sizes and numbers
// carry an outline in the opposite color, so they read on a white wall or a dark floor alike.

import { tidyTitle } from './titles';
import type { Mark, MarkColor, MarkPoint } from './types';

export const MARK_COLORS: Record<MarkColor, string> = {
  red: '#D70015',
  yellow: '#FFD60A',
  white: '#FFFFFF',
  black: '#000000',
};

export const MARK_COLOR_NAMES: Record<MarkColor, string> = { red: 'Red', yellow: 'Yellow', white: 'White', black: 'Black' };

/** The outline drawn around words and numbers in each color, so they stand out from the photo. */
export const MARK_OUTLINES: Record<MarkColor, string> = { red: '#FFFFFF', yellow: '#000000', white: '#000000', black: '#FFFFFF' };

/**
 * The standard words for a note, one tap each, so the same thing is called the same on every
 * photo. Anything else can still be typed.
 */
export const QUICK_NOTES = ['Touch up', 'Caulk', 'Patch', 'Clean', 'Scratch', 'Chip', 'Crack', 'Gap', 'Dent', 'Loose', 'Missing', 'Install here'] as const;

/**
 * Line weight and note size as fractions of the photo's shorter side, so marks look the same at any
 * size: a thumbnail is the photo in small, with lines kept just thick enough to see.
 */
export const STROKE = 0.013;
export const TEXT_SIZE = 0.056;
const ARROW_HEAD = 0.05;
/** Half the length of the bar across each end of a measurement. */
const END_BAR = 0.03;
/** The radius of a numbered spot. */
const SPOT = 0.045;
/** A drag shorter than this (a fraction of the shorter side) was a tap, not a mark. */
const SMALLEST = 0.012;

export type MarkShape =
  | { type: 'path'; d: string; stroke: string; strokeWidth: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; stroke: string; strokeWidth: number; fill?: string }
  | { type: 'rect'; x: number; y: number; width: number; height: number; stroke: string; strokeWidth: number }
  | {
      type: 'text';
      x: number;
      y: number;
      text: string;
      fill: string;
      fontSize: number;
      /** middle: centered on x. Left out: starts at x. */
      anchor?: 'middle';
      /** An outline around the letters, drawn under the text of the same words. */
      stroke?: string;
      strokeWidth?: number;
    };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clampPoint = ([x, y]: MarkPoint): MarkPoint => [clamp01(x), clamp01(y)];

const round = (v: number) => Math.round(v * 10) / 10;

/** Words in the mark's color over an outline in the opposite color. */
function words(x: number, y: number, text: string, color: MarkColor, fontSize: number, anchor?: 'middle'): MarkShape[] {
  const outline = MARK_OUTLINES[color];
  const base = { type: 'text' as const, x, y, text, fontSize, ...(anchor ? { anchor } : {}) };
  return [
    { ...base, fill: outline, stroke: outline, strokeWidth: round(Math.max(0.5, fontSize * 0.2)) },
    { ...base, fill: MARK_COLORS[color] },
  ];
}

/** Where the baseline goes so the words sit centered on y: capitals and numbers are about 0.7 of the size tall. */
const centered = (y: number, fontSize: number) => round(y + fontSize * 0.36);

/** The pixels to draw one mark on a photo shown at width by height. */
export function markShapes(mark: Mark, width: number, height: number): MarkShape[] {
  const short = Math.min(width, height);
  const stroke = MARK_COLORS[mark.color];
  const strokeWidth = Math.max(1.5, STROKE * short);
  const px = ([x, y]: MarkPoint): [number, number] => [round(x * width), round(y * height)];

  switch (mark.tool) {
    case 'pen': {
      const pts = mark.points.map(px);
      if (pts.length === 0) return [];
      return [{ type: 'path', d: smoothPath(pts), stroke, strokeWidth }];
    }
    case 'arrow': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const head = Math.min(ARROW_HEAD * short + strokeWidth, len * 0.6);
      const [ux, uy] = [(x1 - x2) / len, (y1 - y2) / len];
      const spin = (deg: number) => {
        const a = (deg * Math.PI) / 180;
        return [round(x2 + head * (ux * Math.cos(a) - uy * Math.sin(a))), round(y2 + head * (ux * Math.sin(a) + uy * Math.cos(a)))];
      };
      const [l, r] = [spin(28), spin(-28)];
      return [{ type: 'path', d: `M${x1} ${y1}L${x2} ${y2}M${l[0]} ${l[1]}L${x2} ${y2}L${r[0]} ${r[1]}`, stroke, strokeWidth }];
    }
    case 'circle': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      return [
        {
          type: 'ellipse',
          cx: round((x1 + x2) / 2),
          cy: round((y1 + y2) / 2),
          rx: round(Math.abs(x2 - x1) / 2),
          ry: round(Math.abs(y2 - y1) / 2),
          stroke,
          strokeWidth,
        },
      ];
    }
    case 'box': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      return [
        { type: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), width: round(Math.abs(x2 - x1)), height: round(Math.abs(y2 - y1)), stroke, strokeWidth },
      ];
    }
    case 'measure': {
      // The line, a bar across each end, and the size in the middle over the line.
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const bar = END_BAR * short;
      const [nx, ny] = [(-(y2 - y1) / len) * bar, ((x2 - x1) / len) * bar];
      const end = (x: number, y: number) => `M${round(x + nx)} ${round(y + ny)}L${round(x - nx)} ${round(y - ny)}`;
      const shapes: MarkShape[] = [{ type: 'path', d: `M${x1} ${y1}L${x2} ${y2}${end(x1, y1)}${end(x2, y2)}`, stroke, strokeWidth }];
      const text = mark.text.trim();
      if (text) {
        const fontSize = round(Math.max(3, TEXT_SIZE * 0.85 * short));
        shapes.push(...words(round((x1 + x2) / 2), centered((y1 + y2) / 2, fontSize), text, mark.color, fontSize, 'middle'));
      }
      return shapes;
    }
    case 'number': {
      // A dot in the mark's color with the number in the opposite color.
      const [cx, cy] = px(mark.at);
      const r = round(Math.max(2.5, SPOT * short));
      const fontSize = round(r * 1.2);
      const outline = MARK_OUTLINES[mark.color];
      return [
        { type: 'ellipse', cx, cy, rx: r, ry: r, stroke: outline, strokeWidth: round(Math.max(1, strokeWidth * 0.5)), fill: stroke },
        { type: 'text', x: cx, y: centered(cy, fontSize), text: String(mark.n), fill: outline, fontSize, anchor: 'middle' },
      ];
    }
    case 'text': {
      const [x, y] = px(mark.at);
      return words(x, y, mark.text, mark.color, round(Math.max(3, TEXT_SIZE * short)));
    }
    default:
      // A kind of mark from a newer version of the app: left off rather than drawn wrong.
      return [];
  }
}

/** A line through the points, rounded between them so a finger's path draws smooth. */
function smoothPath(pts: [number, number][]): string {
  const [first] = pts;
  if (!first) return '';
  if (pts.length === 1) return `M${first[0]} ${first[1]}l0.1 0`;
  let d = `M${first[0]} ${first[1]}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += `Q${x} ${y} ${round((x + nx) / 2)} ${round((y + ny) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${last[0]} ${last[1]}`;
}

/** True when a drag was too short to mean anything: a tap with the arrow, circle, box or measurement. */
export function isTooSmall(mark: Mark, aspect = 1): boolean {
  // aspect = width / height of the photo; distances are measured on the shorter side.
  const dist = (a: MarkPoint, b: MarkPoint) => {
    const dx = (b[0] - a[0]) * (aspect >= 1 ? aspect : 1);
    const dy = (b[1] - a[1]) * (aspect >= 1 ? 1 : 1 / aspect);
    return Math.hypot(dx, dy);
  };
  switch (mark.tool) {
    case 'pen':
      return mark.points.length < 2;
    case 'text':
      return mark.text.trim() === '';
    case 'number':
      return false;
    default:
      return dist(mark.from, mark.to) < SMALLEST;
  }
}

/** Drops points closer than this to the last one kept, so a long line stays light to store. */
export function addPenPoint(points: MarkPoint[], p: MarkPoint, minStep = 0.004): MarkPoint[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < minStep) return points;
  return [...points, clampPoint(p)];
}

/** The part of the photo the marks are on, as fractions: left, top, right, bottom. Null with no marks. */
export function markBounds(marks: Mark[]): [left: number, top: number, right: number, bottom: number] | null {
  const pts: MarkPoint[] = [];
  for (const m of marks) {
    if (m.tool === 'pen') pts.push(...m.points);
    else if ('at' in m) pts.push(m.at);
    else if ('from' in m) pts.push(m.from, m.to);
  }
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The number for the next spot on a photo: one more than the highest so far. */
export function nextNumber(marks: Mark[]): number {
  return marks.reduce((n, m) => (m.tool === 'number' ? Math.max(n, m.n) : n), 0) + 1;
}

export type MeasureUnit = 'inches' | 'feet';

const NUM = String.raw`(\d+(?:\.\d+)?(?:[ -]\d+/\d+)?|\d+/\d+)`;
const FEET = String.raw`(?:'|ft\.?|foot|feet)`;
const INCHES = String.raw`(?:"|''|in\.?|inch|inches)`;
const FEET_AND_INCHES = new RegExp(`^${NUM} ?${FEET}[ -]*${NUM} ?${INCHES}?$`);
const JUST_FEET = new RegExp(`^${NUM} ?${FEET}$`);
const JUST_INCHES = new RegExp(`^${NUM} ?${INCHES}$`);
const JUST_NUMBER = new RegExp(`^${NUM}$`);

/** A number as typed ("3-1/2" reads 3 1/2) and how much it is. */
function amount(raw: string): { text: string; value: number } {
  const text = raw.replace(/(\d)-(?=\d+\/\d+)/, '$1 ');
  let value = 0;
  for (const part of text.split(' ')) {
    const [a, b] = part.split('/');
    value += b ? Number(a) / Number(b) : Number(a);
  }
  return { text, value };
}

/** "1 inch", "1/4 inch", "24 inches". */
const sized = (n: { text: string; value: number }, one: string, many: string) => `${n.text} ${n.value > 0 && n.value <= 1 ? one : many}`;

/**
 * A measurement as it reads on the photo, written out with no abbreviations: 24 with inches picked
 * reads 24 inches, 2'6" reads 2 feet 6 inches, 1/4" reads 1/4 inch. Words that are not a
 * measurement stay as typed.
 */
export function measureText(input: string, unit: MeasureUnit = 'inches'): string {
  const t = input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'")
    .toLowerCase();
  if (t === '') return '';
  const both = t.match(FEET_AND_INCHES);
  if (both) {
    const feet = sized(amount(both[1]!), 'foot', 'feet');
    const inches = amount(both[2]!);
    return inches.value === 0 ? feet : `${feet} ${sized(inches, 'inch', 'inches')}`;
  }
  const feet = t.match(JUST_FEET);
  if (feet) return sized(amount(feet[1]!), 'foot', 'feet');
  const inches = t.match(JUST_INCHES);
  if (inches) return sized(amount(inches[1]!), 'inch', 'inches');
  const bare = t.match(JUST_NUMBER);
  if (bare) return unit === 'feet' ? sized(amount(bare[1]!), 'foot', 'feet') : sized(amount(bare[1]!), 'inch', 'inches');
  return tidyTitle(input);
}
