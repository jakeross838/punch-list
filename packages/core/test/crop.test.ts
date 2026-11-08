import { describe, expect, it } from 'vitest';
import {
  BOX_LEAST,
  croppedMarks,
  croppedPoint,
  croppedSize,
  cropRect,
  dragBox,
  isNoCrop,
  levelAngle,
  levelZoom,
  NO_CROP,
  turnCrop,
  turnedBox,
  type Mark,
  type MarkPoint,
  type PhotoCrop,
} from '../src/index';

const close = (a: MarkPoint, b: MarkPoint) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('crop and straighten', () => {
  it('leaves a photo with no crop as it was, marks and all', () => {
    const marks: Mark[] = [{ tool: 'circle', color: 'red', from: [0.2, 0.2], to: [0.4, 0.5] }];
    expect(isNoCrop(NO_CROP)).toBe(true);
    expect(croppedMarks(marks, 4000, 3000, NO_CROP)).toBe(marks);
    expect(croppedSize(4000, 3000, NO_CROP)).toEqual({ width: 4000, height: 3000 });
    close(croppedPoint([0.3, 0.7], 4000, 3000, NO_CROP), [0.3, 0.7]);
  });

  it('turns a quarter to the right: the top goes to the right and the picture stands up', () => {
    const turned: PhotoCrop = { ...NO_CROP, turns: 1 };
    expect(isNoCrop(turned)).toBe(false);
    expect(croppedSize(4000, 3000, turned)).toEqual({ width: 3000, height: 4000 });
    close(croppedPoint([0.5, 0], 4000, 3000, turned), [1, 0.5]);
    close(croppedPoint([1, 0.5], 4000, 3000, turned), [0.5, 1]);
    close(croppedPoint([0.25, 0.75], 4000, 3000, turned), [0.25, 0.25]);
    // Four quarter turns come back around.
    const around: PhotoCrop = turnCrop(turnCrop(turnCrop(turnCrop(NO_CROP))));
    expect(around.turns).toBe(0);
    expect(around.box).toEqual(NO_CROP.box);
  });

  it('levels by a few degrees, zooming in just enough that no empty corner shows', () => {
    expect(levelZoom(4000, 3000, 0)).toBe(1);
    const k = levelZoom(4000, 3000, 5);
    const a = (5 * Math.PI) / 180;
    expect(k).toBeCloseTo(Math.cos(a) + (4 / 3) * Math.sin(a), 9);
    // The same either way.
    expect(levelZoom(4000, 3000, -5)).toBeCloseTo(k, 9);
    // Each corner of the kept picture is inside the photo as it was.
    const crop: PhotoCrop = { ...NO_CROP, angle: 5 };
    const back = (q: MarkPoint): MarkPoint => {
      // The kept corner, in the photo as it was: turned back by the angle.
      const x = ((q[0] - 0.5) * 4000) / k;
      const y = ((q[1] - 0.5) * 3000) / k;
      return [(x * Math.cos(-a) - y * Math.sin(-a)) / 4000 + 0.5, (x * Math.sin(-a) + y * Math.cos(-a)) / 3000 + 0.5];
    };
    for (const corner of [[0, 0], [1, 0], [0, 1], [1, 1]] as MarkPoint[]) {
      const p = back(corner);
      expect(p[0]).toBeGreaterThanOrEqual(-1e-9);
      expect(p[0]).toBeLessThanOrEqual(1 + 1e-9);
      expect(p[1]).toBeGreaterThanOrEqual(-1e-9);
      expect(p[1]).toBeLessThanOrEqual(1 + 1e-9);
      // And it goes back to where it was.
      close(croppedPoint(p, 4000, 3000, crop), corner);
    }
    // The middle stays in the middle.
    close(croppedPoint([0.5, 0.5], 4000, 3000, crop), [0.5, 0.5]);
  });

  it('keeps a box: the marks keep their spots, those cut off go, and the rest come in to the edge', () => {
    const crop: PhotoCrop = { ...NO_CROP, box: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } };
    expect(croppedSize(4000, 3000, crop)).toEqual({ width: 2000, height: 1500 });
    const marks: Mark[] = [
      { tool: 'circle', color: 'red', from: [0.4, 0.4], to: [0.6, 0.6] },
      { tool: 'number', color: 'yellow', at: [0.1, 0.1], n: 1 },
      { tool: 'arrow', color: 'red', from: [0.1, 0.5], to: [0.5, 0.5] },
      { tool: 'text', color: 'white', at: [0.5, 0.3], text: 'Caulk', to: [0.9, 0.9] },
      { tool: 'text', color: 'white', at: [0.95, 0.95], text: 'Gone' },
      { tool: 'pen', color: 'black', points: [[0.05, 0.05], [0.1, 0.1]] },
    ];
    const out = croppedMarks(marks, 4000, 3000, crop);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ tool: 'circle' });
    close((out[0] as { from: MarkPoint }).from, [0.3, 0.3]);
    close((out[0] as { to: MarkPoint }).to, [0.7, 0.7]);
    // The arrow's tail is pulled in to the edge; its tip stays on the work.
    close((out[1] as { from: MarkPoint }).from, [0, 0.5]);
    close((out[1] as { to: MarkPoint }).to, [0.5, 0.5]);
    // The note's words stay; the spot it points at comes in to the corner.
    close((out[2] as { at: MarkPoint }).at, [0.5, 0.1]);
    close((out[2] as { to: MarkPoint }).to!, [1, 1]);
  });

  it('turns the box with the picture', () => {
    const b = turnedBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(b.x).toBeCloseTo(0.4, 9);
    expect(b.y).toBeCloseTo(0.1, 9);
    expect(b.width).toBeCloseTo(0.4, 9);
    expect(b.height).toBeCloseTo(0.3, 9);
    const crop = turnCrop({ ...NO_CROP, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } });
    expect(crop.turns).toBe(1);
    // A point in the box before the turn is in the same spot of the box after it.
    const before = croppedPoint([0.2, 0.4], 4000, 3000, { ...NO_CROP, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } });
    const after = croppedPoint([0.2, 0.4], 4000, 3000, crop);
    close(after, [1 - before[1], before[0]]);
  });

  it('drags a corner or the whole box, and keeps it on the picture and big enough to see', () => {
    const box = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
    expect(dragBox(box, 'top-left', 0.1, 0.05)).toEqual({ x: 0.30000000000000004, y: 0.25, width: 0.5, height: 0.55 });
    const pushed = dragBox(box, 'bottom-right', 1, 1);
    expect(pushed.x + pushed.width).toBe(1);
    expect(pushed.y + pushed.height).toBe(1);
    const squeezed = dragBox(box, 'top-left', 5, 5);
    expect(squeezed.width).toBeCloseTo(BOX_LEAST, 9);
    expect(squeezed.height).toBeCloseTo(BOX_LEAST, 9);
    const moved = dragBox(box, 'middle', -1, 0.1);
    expect(moved).toEqual({ x: 0, y: 0.30000000000000004, width: 0.6, height: 0.6 });
  });

  it('keeps the angle within reach, to a tenth of a degree', () => {
    expect(levelAngle(3.14159)).toBe(3.1);
    expect(levelAngle(40)).toBe(15);
    expect(levelAngle(-40)).toBe(-15);
    expect(levelAngle(Number.NaN)).toBe(0);
  });

  it('says which pixels to keep on the picture tools turned canvas', () => {
    // No turn and no leveling: the box in pixels.
    expect(cropRect(4000, 3000, { width: 4000, height: 3000 }, { ...NO_CROP, box: { x: 0.25, y: 0.5, width: 0.5, height: 0.5 } })).toEqual({
      originX: 1000,
      originY: 1500,
      width: 2000,
      height: 1500,
    });
    // Leveled: the canvas grows to hold the turned picture, and the kept part sits in its middle.
    const a = (10 * Math.PI) / 180;
    const cw = Math.floor(4000 * Math.cos(a) + 3000 * Math.sin(a));
    const ch = Math.floor(4000 * Math.sin(a) + 3000 * Math.cos(a));
    const k = levelZoom(4000, 3000, 10);
    const r = cropRect(cw, ch, { width: 4000, height: 3000 }, { ...NO_CROP, angle: 10 });
    expect(r.width).toBe(Math.round(4000 / k));
    expect(r.height).toBe(Math.round(3000 / k));
    expect(Math.abs(r.originX + r.width / 2 - cw / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.originY + r.height / 2 - ch / 2)).toBeLessThanOrEqual(1);
    // Never past the canvas.
    const edge = cropRect(100, 80, { width: 100, height: 80 }, { ...NO_CROP, box: { x: 0.999, y: 0.999, width: 0.5, height: 0.5 } });
    expect(edge.originX + edge.width).toBeLessThanOrEqual(100);
    expect(edge.originY + edge.height).toBeLessThanOrEqual(80);
  });
});
