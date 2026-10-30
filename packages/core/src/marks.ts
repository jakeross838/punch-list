// Markup on a photo, made for the job site: pen lines, arrows, circles, boxes, measurements with
// their size written out, numbered spots and short notes. Marks are stored as points on the photo
// (fractions of its width and height), drawn over it at any size, and never burned into the
// picture, so the original is always kept and a mark can be undone later.
//
// The look is a professional one: fine lines with a soft edge under them so they show on a white
// wall or a dark floor, solid arrowheads, notes and sizes set in label tags, measurements drawn like
// a dimension on the plans, and numbered spots as pins.

import { tidyTitle } from './titles';
import type { Mark, MarkColor, MarkPoint } from './types';

export const MARK_COLORS: Record<MarkColor, string> = {
  red: '#D70015',
  yellow: '#FFD60A',
  white: '#FFFFFF',
  black: '#000000',
};

export const MARK_COLOR_NAMES: Record<MarkColor, string> = { red: 'Red', yellow: 'Yellow', white: 'White', black: 'Black' };

/** The words on a tag or a pin in each color. */
export const MARK_INK: Record<MarkColor, string> = { red: '#FFFFFF', yellow: '#1C1C1E', white: '#1C1C1E', black: '#FFFFFF' };

/** The soft edge under each mark, so it stands out from the photo: dark under light colors, light under black. */
const EDGE: Record<MarkColor, string> = {
  red: 'rgba(0, 0, 0, 0.3)',
  yellow: 'rgba(0, 0, 0, 0.42)',
  white: 'rgba(0, 0, 0, 0.42)',
  black: 'rgba(255, 255, 255, 0.6)',
};

/**
 * The standard words for a note, one tap each, so the same thing is called the same on every
 * photo. Anything else can still be typed.
 */
export const QUICK_NOTES = ['Touch up', 'Caulk', 'Patch', 'Clean', 'Scratch', 'Chip', 'Crack', 'Gap', 'Dent', 'Loose', 'Missing', 'Install here'] as const;

/**
 * Sizes as fractions of the photo's shorter side, so marks look the same at any size: a thumbnail
 * is the photo in small, with lines kept just thick enough to see.
 */
export const STROKE = 0.0085;
export const TEXT_SIZE = 0.04;
/** How much wider the soft edge is than the line on it. */
const EDGE_WIDTH = 0.0065;
const ARROW_LENGTH = 0.046;
const ARROW_WIDTH = 0.036;
/** Half the length of the bar across each end of a measurement. */
const END_BAR = 0.024;
/** The radius of a numbered spot. */
const SPOT = 0.032;
/** A drag shorter than this (a fraction of the shorter side) was a tap, not a mark. */
const SMALLEST = 0.012;

export type MarkShape =
  | { type: 'path'; d: string; stroke: string; strokeWidth: number; fill?: string }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; stroke: string; strokeWidth: number; fill?: string }
  | { type: 'rect'; x: number; y: number; width: number; height: number; stroke: string; strokeWidth: number; rx?: number; fill?: string }
  | {
      type: 'text';
      x: number;
      y: number;
      text: string;
      fill: string;
      fontSize: number;
      /** middle: centered on x. Left out: starts at x. */
      anchor?: 'middle';
    };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clampPoint = ([x, y]: MarkPoint): MarkPoint => [clamp01(x), clamp01(y)];

const round = (v: number) => Math.round(v * 10) / 10;

/** Where the baseline goes so the words sit centered on y: capitals and numbers are about 0.7 of the size tall. */
const centered = (y: number, fontSize: number) => round(y + fontSize * 0.35);

/** About how wide a line of words sets, for a semibold sans like the app's: enough to size a tag around it. */
export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.26;
    else if ('ijl.,:;!|\'"'.includes(ch)) em += 0.28;
    else if ('frt()/-'.includes(ch)) em += 0.38;
    else if ('mwMW'.includes(ch)) em += 0.86;
    else if (ch >= '0' && ch <= '9') em += 0.6;
    else if (ch >= 'A' && ch <= 'Z') em += 0.68;
    else em += 0.56;
  }
  return em * fontSize;
}

/** A line with its soft edge under it. */
function lined(shape: Extract<MarkShape, { type: 'path' | 'ellipse' | 'rect' }>, color: MarkColor, edge: number): MarkShape[] {
  return [{ ...shape, stroke: EDGE[color], strokeWidth: round(shape.strokeWidth + edge) }, shape];
}

/** A solid arrowhead with its tip at x, y, pointing along ux, uy. */
function arrowhead(x: number, y: number, ux: number, uy: number, length: number, width: number): string {
  const [bx, by] = [x - ux * length, y - uy * length];
  const [nx, ny] = [-uy * (width / 2), ux * (width / 2)];
  return `M${round(x)} ${round(y)}L${round(bx + nx)} ${round(by + ny)}L${round(bx - nx)} ${round(by - ny)}Z`;
}

/** A solid shape in the mark's color with its soft edge, like an arrowhead. */
function solid(d: string, color: MarkColor, edge: number): MarkShape[] {
  const fill = MARK_COLORS[color];
  return [
    { type: 'path', d, stroke: EDGE[color], strokeWidth: round(edge), fill: EDGE[color] },
    { type: 'path', d, stroke: fill, strokeWidth: round(edge * 0.25), fill },
  ];
}

/** Words set in a tag in the mark's color, centered on x, y. */
function tag(x: number, y: number, text: string, color: MarkColor, fontSize: number, edge: number): MarkShape[] {
  const height = round(fontSize * 1.7);
  const width = round(textWidth(text, fontSize) + fontSize * 1.25);
  const left = round(x - width / 2);
  const top = round(y - height / 2);
  const e = round(edge / 2);
  return [
    { type: 'rect', x: left - e, y: top - e, width: width + 2 * e, height: height + 2 * e, rx: round(height / 2 + e), stroke: 'none', strokeWidth: 0, fill: EDGE[color] },
    { type: 'rect', x: left, y: top, width, height, rx: round(height / 2), stroke: 'none', strokeWidth: 0, fill: MARK_COLORS[color] },
    { type: 'text', x: round(x), y: centered(y, fontSize), text, fill: MARK_INK[color], fontSize, anchor: 'middle' },
  ];
}

/** The pixels to draw one mark on a photo shown at width by height. */
export function markShapes(mark: Mark, width: number, height: number): MarkShape[] {
  const short = Math.min(width, height);
  const stroke = MARK_COLORS[mark.color];
  const strokeWidth = round(Math.max(1.25, STROKE * short));
  const edge = EDGE_WIDTH * short;
  const fontSize = round(Math.max(2, TEXT_SIZE * short));
  const px = ([x, y]: MarkPoint): [number, number] => [round(x * width), round(y * height)];

  switch (mark.tool) {
    case 'pen': {
      const pts = mark.points.map(px);
      if (pts.length === 0) return [];
      return lined({ type: 'path', d: smoothPath(pts), stroke, strokeWidth }, mark.color, edge);
    }
    case 'arrow': {
      // The shaft stops inside the head, so the head's point stays sharp.
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
      const head = Math.min(ARROW_LENGTH * short + strokeWidth, len * 0.5);
      const wide = head * (ARROW_WIDTH / ARROW_LENGTH);
      const [sx, sy] = [round(x2 - ux * head * 0.6), round(y2 - uy * head * 0.6)];
      return [
        ...lined({ type: 'path', d: `M${x1} ${y1}L${sx} ${sy}`, stroke, strokeWidth }, mark.color, edge),
        ...solid(arrowhead(x2, y2, ux, uy, head, wide), mark.color, edge),
      ];
    }
    case 'circle': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      return lined(
        {
          type: 'ellipse',
          cx: round((x1 + x2) / 2),
          cy: round((y1 + y2) / 2),
          rx: round(Math.abs(x2 - x1) / 2),
          ry: round(Math.abs(y2 - y1) / 2),
          stroke,
          strokeWidth,
        },
        mark.color,
        edge,
      );
    }
    case 'box': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const rect = { type: 'rect' as const, x: Math.min(x1, x2), y: Math.min(y1, y2), width: round(Math.abs(x2 - x1)), height: round(Math.abs(y2 - y1)) };
      return lined({ ...rect, rx: round(short * 0.01), stroke, strokeWidth }, mark.color, edge);
    }
    case 'measure': {
      // Drawn like a dimension on the plans: a bar across each end, an arrowhead into each bar,
      // and the size in a tag in the middle of the line.
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
      const bar = END_BAR * short;
      const [nx, ny] = [-uy * bar, ux * bar];
      const end = (x: number, y: number) => `M${round(x + nx)} ${round(y + ny)}L${round(x - nx)} ${round(y - ny)}`;
      const head = Math.min(ARROW_LENGTH * 0.8 * short, len * 0.3);
      const wide = head * (ARROW_WIDTH / ARROW_LENGTH);
      const shapes: MarkShape[] = [
        ...lined({ type: 'path', d: `M${x1} ${y1}L${x2} ${y2}${end(x1, y1)}${end(x2, y2)}`, stroke, strokeWidth }, mark.color, edge),
        ...solid(arrowhead(x1, y1, -ux, -uy, head, wide), mark.color, edge),
        ...solid(arrowhead(x2, y2, ux, uy, head, wide), mark.color, edge),
      ];
      const text = mark.text.trim();
      if (text) shapes.push(...tag(round((x1 + x2) / 2), round((y1 + y2) / 2), text, mark.color, round(fontSize * 0.92), edge));
      return shapes;
    }
    case 'number': {
      // A pin: a dot in the mark's color with a white ring, and its number in the middle.
      const [cx, cy] = px(mark.at);
      const r = round(Math.max(2, SPOT * short));
      const ring = round(Math.max(0.5, r * 0.16));
      const size = round(r * 1.05);
      return [
        { type: 'ellipse', cx, cy, rx: round(r + edge / 2), ry: round(r + edge / 2), stroke: 'none', strokeWidth: 0, fill: EDGE[mark.color] },
        { type: 'ellipse', cx, cy, rx: round(r - ring / 2), ry: round(r - ring / 2), stroke: '#FFFFFF', strokeWidth: ring, fill: stroke },
        { type: 'text', x: cx, y: centered(cy, size), text: String(mark.n), fill: MARK_INK[mark.color], fontSize: size, anchor: 'middle' },
      ];
    }
    case 'text': {
      // A note is a tag centered where it was placed.
      const [x, y] = px(mark.at);
      return tag(x, y, mark.text, mark.color, fontSize, edge);
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
