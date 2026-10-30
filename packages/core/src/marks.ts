// Markup on a photo: pen lines, arrows, circles, boxes and short notes. Marks are stored as points
// on the photo (fractions of its width and height), drawn over it at any size, and never burned
// into the picture, so the original is always kept and a mark can be undone later.

import type { Mark, MarkColor, MarkPoint } from './types';

export const MARK_COLORS: Record<MarkColor, string> = {
  red: '#D70015',
  yellow: '#FFD60A',
  white: '#FFFFFF',
  black: '#000000',
};

export const MARK_COLOR_NAMES: Record<MarkColor, string> = { red: 'Red', yellow: 'Yellow', white: 'White', black: 'Black' };

/** Line weight and note size as fractions of the photo's shorter side, so marks look the same at any size. */
export const STROKE = 0.013;
export const TEXT_SIZE = 0.056;
const ARROW_HEAD = 0.05;
/** A drag shorter than this (a fraction of the shorter side) was a tap, not a mark. */
const SMALLEST = 0.012;

export type MarkShape =
  | { type: 'path'; d: string; stroke: string; strokeWidth: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; stroke: string; strokeWidth: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; stroke: string; strokeWidth: number }
  | { type: 'text'; x: number; y: number; text: string; fill: string; fontSize: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const clampPoint = ([x, y]: MarkPoint): MarkPoint => [clamp01(x), clamp01(y)];

const round = (v: number) => Math.round(v * 10) / 10;

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
    case 'text': {
      const [x, y] = px(mark.at);
      return [{ type: 'text', x, y, text: mark.text, fill: stroke, fontSize: round(Math.max(11, TEXT_SIZE * short)) }];
    }
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

/** True when a drag was too short to mean anything: a tap with the arrow, circle or box. */
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
