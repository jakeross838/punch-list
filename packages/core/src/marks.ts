// Markup on a photo, made for the job site: circles, arrows, and notes that point at the work with
// an arrow, the three marks used most; then pen lines, boxes, measurements with their size written
// out, and numbered spots. Marks are stored as points on the photo (fractions of its width and
// height), drawn over it at any size, and never burned into the picture, so the original is always
// kept and a mark can be changed later.
//
// The look is a plain, professional one, like a drawing marked up by hand in red: solid lines with
// round ends, a sharp arrowhead, and words set in a square label in the mark's color. A thin, faint
// halo under each mark keeps it clear on a white wall or a dark floor without reading as an outline.

import { tidyTitle } from './titles';
import type { Mark, MarkColor, MarkPoint } from './types';

export const MARK_COLORS: Record<MarkColor, string> = {
  red: '#D70015',
  yellow: '#FFD60A',
  white: '#FFFFFF',
  black: '#000000',
};

export const MARK_COLOR_NAMES: Record<MarkColor, string> = { red: 'Red', yellow: 'Yellow', white: 'White', black: 'Black' };

/** The words on a label or a spot in each color. */
export const MARK_INK: Record<MarkColor, string> = { red: '#FFFFFF', yellow: '#1C1C1E', white: '#1C1C1E', black: '#FFFFFF' };

/** The faint halo under each mark: dark under light colors, light under black. */
const HALO: Record<MarkColor, string> = {
  red: 'rgba(0, 0, 0, 0.22)',
  yellow: 'rgba(0, 0, 0, 0.4)',
  white: 'rgba(0, 0, 0, 0.4)',
  black: 'rgba(255, 255, 255, 0.5)',
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
export const STROKE = 0.0095;
export const TEXT_SIZE = 0.038;
/** How much wider the halo is than the line on it. */
const HALO_WIDTH = 0.0026;
/** An arrowhead's length and half its width, in line widths, and how deep the notch in its back is. */
const HEAD_LENGTH = 4.6;
const HEAD_HALF = 2.15;
const HEAD_NOTCH = 0.28;
/** Half the length of the bar across each end of a measurement. */
const END_BAR = 0.022;
/** The radius of a numbered spot. */
const SPOT = 0.027;
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

/** About how wide a line of words sets, for a semibold sans like the app's: enough to size a label around it. */
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

/** The sizes a mark is drawn at, on a photo shown at width by height. */
function sizes(width: number, height: number) {
  const short = Math.min(width, height);
  const strokeWidth = round(Math.max(1.25, STROKE * short));
  return {
    short,
    strokeWidth,
    halo: HALO_WIDTH * short,
    fontSize: round(Math.max(2, TEXT_SIZE * short)),
  };
}

/** A mark's shapes in two layers: every halo goes under every line, so a halo never crosses a line. */
interface Layers {
  under: MarkShape[];
  over: MarkShape[];
}

/** A line, with its halo under it. */
function stroked(l: Layers, shape: Extract<MarkShape, { type: 'path' | 'ellipse' | 'rect' }>, color: MarkColor, halo: number): void {
  l.under.push({ ...shape, stroke: HALO[color], strokeWidth: round(shape.strokeWidth + halo) });
  l.over.push(shape);
}

/** A solid shape in the mark's color, like an arrowhead, with its halo. Its corners are rounded by a thin line around it. */
function filled(l: Layers, d: string, color: MarkColor, halo: number, edge: number): void {
  l.under.push({ type: 'path', d, stroke: HALO[color], strokeWidth: round(edge + halo), fill: HALO[color] });
  l.over.push({ type: 'path', d, stroke: MARK_COLORS[color], strokeWidth: round(edge), fill: MARK_COLORS[color] });
}

/** A sharp arrowhead with its tip at x, y, pointing along ux, uy, and the point in its notch, where a shaft ends. */
function arrowhead(x: number, y: number, ux: number, uy: number, length: number, half: number): { d: string; notch: [number, number] } {
  const [bx, by] = [x - ux * length, y - uy * length];
  const [nx, ny] = [-uy * half, ux * half];
  const notch: [number, number] = [round(x - ux * length * (1 - HEAD_NOTCH)), round(y - uy * length * (1 - HEAD_NOTCH))];
  return {
    d: `M${round(x)} ${round(y)}L${round(bx + nx)} ${round(by + ny)}L${notch[0]} ${notch[1]}L${round(bx - nx)} ${round(by - ny)}Z`,
    notch,
  };
}

/** An arrow from x1, y1 to its tip at x2, y2: the shaft stops in the head's notch, so the tip stays sharp. */
function arrow(l: Layers, [x1, y1]: [number, number], [x2, y2]: [number, number], color: MarkColor, strokeWidth: number, halo: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
  const length = Math.min(HEAD_LENGTH * strokeWidth, len * 0.6);
  const half = length * (HEAD_HALF / HEAD_LENGTH);
  const head = arrowhead(x2, y2, ux, uy, length, half);
  stroked(l, { type: 'path', d: `M${round(x1)} ${round(y1)}L${head.notch[0]} ${head.notch[1]}`, stroke: MARK_COLORS[color], strokeWidth }, color, halo);
  filled(l, head.d, color, halo, strokeWidth * 0.3);
}

/** Where a label sits: a box centered on x, y around its words. */
export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function labelBox(x: number, y: number, text: string, fontSize: number): LabelBox {
  const height = round(fontSize * 1.6);
  const width = round(textWidth(text, fontSize) + fontSize * 0.95);
  return { x: round(x - width / 2), y: round(y - height / 2), width, height };
}

/**
 * Where a note's words sit on a photo shown at width by height: centered where they were placed,
 * and moved in from any edge they would cross, so a note near the edge can still be read.
 */
function noteBox(mark: { at: MarkPoint; text: string }, width: number, height: number, fontSize: number): LabelBox {
  const box = labelBox(mark.at[0] * width, mark.at[1] * height, mark.text, fontSize);
  const x = box.width >= width ? 0 : Math.min(Math.max(box.x, 0), width - box.width);
  const y = box.height >= height ? 0 : Math.min(Math.max(box.y, 0), height - box.height);
  return { ...box, x: round(x), y: round(y) };
}

const middle = (box: LabelBox): [number, number] => [round(box.x + box.width / 2), round(box.y + box.height / 2)];

/** Words set in a square label in the mark's color, centered on x, y. */
function label(l: Layers, x: number, y: number, text: string, color: MarkColor, fontSize: number, halo: number): LabelBox {
  const box = labelBox(x, y, text, fontSize);
  const rx = round(Math.max(1, fontSize * 0.12));
  const e = round(halo / 2);
  l.under.push({ type: 'rect', x: box.x - e, y: box.y - e, width: box.width + 2 * e, height: box.height + 2 * e, rx: rx + e, stroke: 'none', strokeWidth: 0, fill: HALO[color] });
  l.over.push(
    { type: 'rect', x: box.x, y: box.y, width: box.width, height: box.height, rx, stroke: 'none', strokeWidth: 0, fill: MARK_COLORS[color] },
    { type: 'text', x: round(x), y: centered(y, fontSize), text, fill: MARK_INK[color], fontSize, anchor: 'middle' },
  );
  return box;
}

/** Where a line from the middle of a box toward a point leaves the box. */
function leavesBox(box: LabelBox, [tx, ty]: [number, number]): [number, number] {
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  const [dx, dy] = [tx - cx, ty - cy];
  const t = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy));
  return [cx + dx * t, cy + dy * t];
}

/** The pixels to draw one mark on a photo shown at width by height. */
export function markShapes(mark: Mark, width: number, height: number): MarkShape[] {
  const { short, strokeWidth, halo, fontSize } = sizes(width, height);
  const stroke = MARK_COLORS[mark.color];
  const px = ([x, y]: MarkPoint): [number, number] => [round(x * width), round(y * height)];
  const l: Layers = { under: [], over: [] };

  switch (mark.tool) {
    case 'pen': {
      const pts = mark.points.map(px);
      if (pts.length === 0) return [];
      stroked(l, { type: 'path', d: smoothPath(pts), stroke, strokeWidth }, mark.color, halo);
      break;
    }
    case 'arrow':
      arrow(l, px(mark.from), px(mark.to), mark.color, strokeWidth, halo);
      break;
    case 'circle': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      stroked(
        l,
        { type: 'ellipse', cx: round((x1 + x2) / 2), cy: round((y1 + y2) / 2), rx: round(Math.abs(x2 - x1) / 2), ry: round(Math.abs(y2 - y1) / 2), stroke, strokeWidth },
        mark.color,
        halo,
      );
      break;
    }
    case 'box': {
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const rect = { type: 'rect' as const, x: Math.min(x1, x2), y: Math.min(y1, y2), width: round(Math.abs(x2 - x1)), height: round(Math.abs(y2 - y1)) };
      stroked(l, { ...rect, rx: round(strokeWidth * 0.6), stroke, strokeWidth }, mark.color, halo);
      break;
    }
    case 'measure': {
      // Drawn like a dimension on the plans: a bar across each end, an arrowhead into each bar,
      // and the size in a label in the middle of the line.
      const [x1, y1] = px(mark.from);
      const [x2, y2] = px(mark.to);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
      const bar = END_BAR * short;
      const [nx, ny] = [-uy * bar, ux * bar];
      const end = (x: number, y: number) => `M${round(x + nx)} ${round(y + ny)}L${round(x - nx)} ${round(y - ny)}`;
      const length = Math.min(HEAD_LENGTH * 0.8 * strokeWidth, len * 0.3);
      const half = length * (HEAD_HALF / HEAD_LENGTH);
      stroked(l, { type: 'path', d: `M${x1} ${y1}L${x2} ${y2}${end(x1, y1)}${end(x2, y2)}`, stroke, strokeWidth }, mark.color, halo);
      filled(l, arrowhead(x1, y1, -ux, -uy, length, half).d, mark.color, halo, strokeWidth * 0.3);
      filled(l, arrowhead(x2, y2, ux, uy, length, half).d, mark.color, halo, strokeWidth * 0.3);
      const text = mark.text.trim();
      if (text) label(l, round((x1 + x2) / 2), round((y1 + y2) / 2), text, mark.color, round(fontSize * 0.92), halo);
      break;
    }
    case 'number': {
      // A spot: a dot in the mark's color with its number in the middle.
      const [cx, cy] = px(mark.at);
      const r = round(Math.max(2, SPOT * short));
      const size = round(r * 1.1);
      l.under.push({ type: 'ellipse', cx, cy, rx: round(r + halo / 2), ry: round(r + halo / 2), stroke: 'none', strokeWidth: 0, fill: HALO[mark.color] });
      l.over.push(
        { type: 'ellipse', cx, cy, rx: r, ry: r, stroke: 'none', strokeWidth: 0, fill: stroke },
        { type: 'text', x: cx, y: centered(cy, size), text: String(mark.n), fill: MARK_INK[mark.color], fontSize: size, anchor: 'middle' },
      );
      break;
    }
    case 'text': {
      // The words in a label where they were placed and, for a note that points, an arrow from the
      // edge of the label to the spot.
      const box = noteBox(mark, width, height, fontSize);
      const [x, y] = middle(box);
      if (mark.to && !inBox(px(mark.to), box, 0)) {
        const tip = px(mark.to);
        const start = leavesBox(box, tip);
        const gap = strokeWidth * 0.9;
        const left = Math.hypot(tip[0] - start[0], tip[1] - start[1]);
        // Pointing somewhere past the label's own edge: the arrow, then the label over its start.
        if (left > gap + HEAD_LENGTH * strokeWidth) {
          const [ux, uy] = [(tip[0] - start[0]) / left, (tip[1] - start[1]) / left];
          arrow(l, [start[0] + ux * gap, start[1] + uy * gap], tip, mark.color, strokeWidth, halo);
        }
      }
      label(l, x, y, mark.text, mark.color, fontSize, halo);
      break;
    }
    default:
      // A kind of mark from a newer version of the app: left off rather than drawn wrong.
      return [];
  }
  return [...l.under, ...l.over];
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
    else if (m.tool === 'text') pts.push(m.at, ...(m.to ? [m.to] : []));
    else if ('at' in m) pts.push(m.at);
    else if ('from' in m) pts.push(m.from, m.to);
  }
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Changing a mark after it is drawn: tap it, then drag it somewhere else, or drag one of its
// handles (the ends of an arrow, a measurement or a note's arrow; two corners of a circle or a box).

/** A part of a mark that is dragged on its own. */
export type MarkHandle = 'from' | 'to' | 'at';

/** The handles of a mark, where they are on the photo. Pen lines, plain notes and numbered spots only move. */
export function markHandles(mark: Mark): { handle: MarkHandle; at: MarkPoint }[] {
  switch (mark.tool) {
    case 'arrow':
    case 'measure':
    case 'circle':
    case 'box':
      return [
        { handle: 'from', at: mark.from },
        { handle: 'to', at: mark.to },
      ];
    case 'text':
      return mark.to ? [{ handle: 'to', at: mark.to }] : [];
    default:
      return [];
  }
}

/** A point on the photo kept to a ten thousandth of it: finer than a pixel, and light to store. */
const fine = (v: number) => Math.round(v * 10000) / 10000;

/** The mark with one of its handles dragged to p. */
export function moveHandle(mark: Mark, handle: MarkHandle, p: MarkPoint): Mark {
  const [x, y] = clampPoint(p);
  const at: MarkPoint = [fine(x), fine(y)];
  if (mark.tool === 'text') return handle === 'to' && mark.to ? { ...mark, to: at } : handle === 'at' ? { ...mark, at } : mark;
  if ('from' in mark && (handle === 'from' || handle === 'to')) return { ...mark, [handle]: at };
  return mark;
}

/** The mark moved by dx, dy (fractions of the photo), kept on the photo as a whole. */
export function moveMark(mark: Mark, dx: number, dy: number): Mark {
  const pts: MarkPoint[] =
    mark.tool === 'pen' ? mark.points : mark.tool === 'text' ? [mark.at, ...(mark.to ? [mark.to] : [])] : 'at' in mark ? [mark.at] : [mark.from, mark.to];
  // As far as it can go before any part of it would leave the photo.
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const mx = Math.min(1 - maxX, Math.max(-minX, dx));
  const my = Math.min(1 - maxY, Math.max(-minY, dy));
  const shift = ([x, y]: MarkPoint): MarkPoint => [fine(x + mx), fine(y + my)];
  switch (mark.tool) {
    case 'pen':
      return { ...mark, points: mark.points.map(shift) };
    case 'text':
      return { ...mark, at: shift(mark.at), ...(mark.to ? { to: shift(mark.to) } : {}) };
    case 'number':
      return { ...mark, at: shift(mark.at) };
    default:
      return { ...mark, from: shift(mark.from), to: shift(mark.to) };
  }
}

/**
 * The handle of a mark under a finger at p, if any: an end or a corner, or the words of a note that
 * points with an arrow, which then move on their own and leave the arrow's tip where it is.
 */
export function handleAt(mark: Mark, p: MarkPoint, width: number, height: number, reach = 26): MarkHandle | null {
  const at: [number, number] = [p[0] * width, p[1] * height];
  for (const h of markHandles(mark)) {
    if (Math.hypot(at[0] - h.at[0] * width, at[1] - h.at[1] * height) <= reach) return h.handle;
  }
  if (mark.tool === 'text' && mark.to) {
    const { fontSize } = sizes(width, height);
    if (inBox(at, noteBox(mark, width, height, fontSize), 4)) return 'at';
  }
  return null;
}

/** The box a mark takes up on a photo shown at width by height, words and line included, for showing it picked. */
export function markFrame(mark: Mark, width: number, height: number): LabelBox {
  const { strokeWidth, fontSize, short } = sizes(width, height);
  const boxes: LabelBox[] = [];
  const point = ([x, y]: MarkPoint, r: number): LabelBox => ({ x: x * width - r, y: y * height - r, width: 2 * r, height: 2 * r });
  if (mark.tool === 'text') {
    boxes.push(noteBox(mark, width, height, fontSize));
    if (mark.to) boxes.push(point(mark.to, strokeWidth));
  } else if (mark.tool === 'number') {
    boxes.push(point(mark.at, SPOT * short));
  } else {
    const pts = mark.tool === 'pen' ? mark.points : [mark.from, mark.to];
    for (const p of pts) boxes.push(point(p, strokeWidth));
    if (mark.tool === 'measure' && mark.text.trim()) {
      const [a, b] = [mark.from, mark.to];
      boxes.push(labelBox(((a[0] + b[0]) / 2) * width, ((a[1] + b[1]) / 2) * height, mark.text.trim(), fontSize * 0.92));
    }
  }
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: round(left), y: round(top), width: round(right - left), height: round(bottom - top) };
}

/** How far a point is from the segment a to b. */
function toSegment([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const [dx, dy] = [bx - ax, by - ay];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const inBox = ([x, y]: [number, number], b: LabelBox, pad: number) => x >= b.x - pad && x <= b.x + b.width + pad && y >= b.y - pad && y <= b.y + b.height + pad;

/**
 * The mark under a finger at p on a photo shown at width by height: the last drawn first, within
 * reach (in points) of its line, inside a circle or a box, or on its words. -1 when there is none.
 * inside false: a circle or a box only by its line, so a tap inside one can still place a note or a
 * number there.
 */
export function markAt(marks: Mark[], p: MarkPoint, width: number, height: number, reach = 22, { inside = true }: { inside?: boolean } = {}): number {
  const { short, fontSize } = sizes(width, height);
  const px = ([x, y]: MarkPoint): [number, number] => [x * width, y * height];
  const at = px(p);
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const m = marks[i]!;
    let hit = false;
    switch (m.tool) {
      case 'pen': {
        const pts = m.points.map(px);
        hit = pts.length === 1 ? Math.hypot(at[0] - pts[0]![0], at[1] - pts[0]![1]) <= reach : pts.some((q, k) => k > 0 && toSegment(at, pts[k - 1]!, q) <= reach);
        break;
      }
      case 'arrow':
        hit = toSegment(at, px(m.from), px(m.to)) <= reach;
        break;
      case 'measure': {
        const [a, b] = [px(m.from), px(m.to)];
        const text = m.text.trim();
        hit = toSegment(at, a, b) <= reach || (!!text && inBox(at, labelBox((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, text, fontSize * 0.92), reach / 2));
        break;
      }
      case 'circle': {
        const [a, b] = [px(m.from), px(m.to)];
        const [rx, ry] = [Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2];
        const [cx, cy] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const out = ((at[0] - cx) / (rx + reach)) ** 2 + ((at[1] - cy) / (ry + reach)) ** 2 <= 1;
        // Near the line: inside the circle grown by reach, and outside it shrunk by reach.
        const shrunk = rx > reach && ry > reach && ((at[0] - cx) / (rx - reach)) ** 2 + ((at[1] - cy) / (ry - reach)) ** 2 < 1;
        hit = out && (inside || !shrunk);
        break;
      }
      case 'box': {
        const [a, b] = [px(m.from), px(m.to)];
        const [l, r, t, u] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
        const out = at[0] >= l - reach && at[0] <= r + reach && at[1] >= t - reach && at[1] <= u + reach;
        const deep = at[0] > l + reach && at[0] < r - reach && at[1] > t + reach && at[1] < u - reach;
        hit = out && (inside || !deep);
        break;
      }
      case 'number': {
        const c = px(m.at);
        hit = Math.hypot(at[0] - c[0], at[1] - c[1]) <= SPOT * short + reach;
        break;
      }
      case 'text': {
        const box = noteBox(m, width, height, fontSize);
        hit = inBox(at, box, reach / 2) || (!!m.to && toSegment(at, middle(box), px(m.to)) <= reach);
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
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
