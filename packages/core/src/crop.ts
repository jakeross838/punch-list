// Crop and straighten a photo, in markup: turn it a quarter turn at a time, level it by a few
// degrees, and keep a box of it. The phone makes a new picture from the photo as it was, and the
// photo as it was stays with the item, removed, so nothing is lost. Every mark keeps its spot on the
// work: each of its points moves with the picture. A mark left wholly outside the box goes, and one
// partly outside is pulled in to the edge.

import { clampPoint } from './marks';
import type { Mark, MarkPoint } from './types';

/** Quarter turns to the right. */
export type QuarterTurns = 0 | 1 | 2 | 3;

/** A part of a picture, as fractions of its width and height. */
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhotoCrop {
  /** Quarter turns to the right. */
  turns: QuarterTurns;
  /** Degrees to the right that level the picture, at most LEVEL_MOST either way. */
  angle: number;
  /** The part kept, as fractions of the turned and leveled picture. */
  box: CropBox;
}

/** Leveling goes this many degrees either way. */
export const LEVEL_MOST = 15;
/** The smallest box, as a fraction of each side. */
export const BOX_LEAST = 0.08;
export const WHOLE_BOX: CropBox = { x: 0, y: 0, width: 1, height: 1 };
export const NO_CROP: PhotoCrop = { turns: 0, angle: 0, box: WHOLE_BOX };

const near = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/** Whether a crop leaves the picture as it was. */
export function isNoCrop(crop: PhotoCrop): boolean {
  const b = crop.box;
  return crop.turns === 0 && Math.abs(crop.angle) < 0.05 && near(b.x, 0) && near(b.y, 0) && near(b.width, 1) && near(b.height, 1);
}

/** The picture's size once turned. */
export function turnedSize(width: number, height: number, turns: QuarterTurns): { width: number; height: number } {
  return turns % 2 === 1 ? { width: height, height: width } : { width, height };
}

/**
 * How much leveling by the angle zooms in, so no empty corner shows: 1 when level. The leveled
 * picture keeps the turned picture's shape, a little smaller.
 */
export function levelZoom(width: number, height: number, angle: number): number {
  const a = (Math.abs(angle) * Math.PI) / 180;
  const long = Math.max(width / (height || 1), height / (width || 1));
  return Math.cos(a) + long * Math.sin(a);
}

/** The kept picture's size, in the units of width and height. */
export function croppedSize(width: number, height: number, crop: PhotoCrop): { width: number; height: number } {
  const t = turnedSize(width, height, crop.turns);
  const k = levelZoom(t.width, t.height, crop.angle);
  return { width: (t.width / k) * crop.box.width, height: (t.height / k) * crop.box.height };
}

/** Where a point on the photo as it was lands on the kept picture, as fractions; outside 0 to 1 when it is cut off. */
export function croppedPoint(p: MarkPoint, width: number, height: number, crop: PhotoCrop): MarkPoint {
  // From the middle of the photo as it was, in its own units.
  let x = (p[0] - 0.5) * width;
  let y = (p[1] - 0.5) * height;
  // Each quarter turn to the right takes the top to the right: (x, y) becomes (-y, x).
  for (let i = 0; i < crop.turns; i += 1) [x, y] = [-y, x];
  // Leveled: turned right by the angle, about the middle.
  const a = (crop.angle * Math.PI) / 180;
  [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const t = turnedSize(width, height, crop.turns);
  const k = levelZoom(t.width, t.height, crop.angle);
  // As fractions of the leveled picture, then of the box.
  const fx = (x * k) / (t.width || 1) + 0.5;
  const fy = (y * k) / (t.height || 1) + 0.5;
  return [(fx - crop.box.x) / (crop.box.width || 1), (fy - crop.box.y) / (crop.box.height || 1)];
}

const pointsOf = (m: Mark): MarkPoint[] => {
  switch (m.tool) {
    case 'pen':
      return m.points;
    case 'number':
      return [m.at];
    case 'text':
      return m.to ? [m.at, m.to] : [m.at];
    default:
      return [m.from, m.to];
  }
};

/** Whether any of the points, or the area between them, is on the kept picture. */
function onPicture(points: MarkPoint[]): boolean {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return Math.max(...xs) >= 0 && Math.min(...xs) <= 1 && Math.max(...ys) >= 0 && Math.min(...ys) <= 1;
}

/** The marks on the kept picture: each point moved with it, those cut off left out, the rest pulled in to the edge. */
export function croppedMarks(marks: Mark[], width: number, height: number, crop: PhotoCrop): Mark[] {
  if (isNoCrop(crop)) return marks;
  const at = (p: MarkPoint) => croppedPoint(p, width, height, crop);
  const out: Mark[] = [];
  for (const m of marks) {
    const moved = pointsOf(m).map(at);
    if (moved.length === 0 || !onPicture(moved)) continue;
    // A numbered spot or the words of a note sit where they are, or not at all.
    if ((m.tool === 'number' || m.tool === 'text') && !onPicture([moved[0]!])) continue;
    const kept = moved.map(clampPoint);
    switch (m.tool) {
      case 'pen':
        out.push({ ...m, points: kept });
        break;
      case 'number':
        out.push({ ...m, at: kept[0]! });
        break;
      case 'text':
        out.push(m.to ? { ...m, at: kept[0]!, to: kept[1]! } : { ...m, at: kept[0]! });
        break;
      default:
        out.push({ ...m, from: kept[0]!, to: kept[1]! });
    }
  }
  return out;
}

/** The box after one more quarter turn to the right: it turns with the picture. */
export function turnedBox(box: CropBox): CropBox {
  return { x: 1 - (box.y + box.height), y: box.x, width: box.height, height: box.width };
}

/** One more quarter turn to the right, the box turning with the picture. */
export function turnCrop(crop: PhotoCrop): PhotoCrop {
  return { ...crop, turns: ((crop.turns + 1) % 4) as QuarterTurns, box: turnedBox(crop.box) };
}

/** An angle kept within reach, to a tenth of a degree. */
export function levelAngle(angle: number): number {
  const a = Math.max(-LEVEL_MOST, Math.min(LEVEL_MOST, Number.isFinite(angle) ? angle : 0));
  return Math.round(a * 10) / 10;
}

/** Which edges of the box a handle moves. */
export type BoxHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'middle';

/**
 * The box as a handle is dragged by dx and dy (fractions of the picture): a corner moves its two
 * edges, the middle moves the whole box. It stays on the picture and no smaller than BOX_LEAST.
 */
export function dragBox(box: CropBox, handle: BoxHandle, dx: number, dy: number): CropBox {
  if (handle === 'middle') {
    const x = Math.max(0, Math.min(1 - box.width, box.x + dx));
    const y = Math.max(0, Math.min(1 - box.height, box.y + dy));
    return { ...box, x, y };
  }
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle === 'top-left' || handle === 'bottom-left') left = Math.max(0, Math.min(right - BOX_LEAST, left + dx));
  if (handle === 'top-right' || handle === 'bottom-right') right = Math.min(1, Math.max(left + BOX_LEAST, right + dx));
  if (handle === 'top-left' || handle === 'top-right') top = Math.max(0, Math.min(bottom - BOX_LEAST, top + dy));
  if (handle === 'bottom-left' || handle === 'bottom-right') bottom = Math.min(1, Math.max(top + BOX_LEAST, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The part to keep, in whole pixels, of a picture turned right by turns times 90 plus the angle on
 * a canvas of canvasWidth by canvasHeight, with the turned picture (turned) at its middle: the way
 * the phone's picture tools turn a picture.
 */
export function cropRect(
  canvasWidth: number,
  canvasHeight: number,
  turned: { width: number; height: number },
  crop: PhotoCrop,
): { originX: number; originY: number; width: number; height: number } {
  const k = levelZoom(turned.width, turned.height, crop.angle);
  const fw = turned.width / k;
  const fh = turned.height / k;
  const originX = Math.max(0, Math.min(canvasWidth - 1, Math.round(canvasWidth / 2 - fw / 2 + crop.box.x * fw)));
  const originY = Math.max(0, Math.min(canvasHeight - 1, Math.round(canvasHeight / 2 - fh / 2 + crop.box.y * fh)));
  const width = Math.max(1, Math.min(canvasWidth - originX, Math.round(crop.box.width * fw)));
  const height = Math.max(1, Math.min(canvasHeight - originY, Math.round(crop.box.height * fh)));
  return { originX, originY, width, height };
}
