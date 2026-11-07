import { describe, expect, it } from 'vitest';
import { describeMarks, handleAt, markAt, markBounds, markFrame, markHandles, markShapes, moveHandle, moveMark, type Mark } from '../src/index';

// A photo shown 400 by 400: a circle on the left, an arrow across the middle, a note on the right
// pointing down at a spot, and a numbered spot near the top.
const circle: Mark = { tool: 'circle', color: 'red', from: [0.1, 0.1], to: [0.3, 0.3] };
const arrow: Mark = { tool: 'arrow', color: 'red', from: [0.35, 0.5], to: [0.65, 0.5] };
const note: Mark = { tool: 'text', color: 'yellow', at: [0.8, 0.2], text: 'Caulk', to: [0.8, 0.7] };
const spot: Mark = { tool: 'number', color: 'red', at: [0.5, 0.1], n: 1 };
const marks = [circle, arrow, note, spot];

describe('finding the mark under a finger', () => {
  it('finds a mark by its line, inside a circle, or on its words, the last drawn first', () => {
    expect(markAt(marks, [0.2, 0.2], 400, 400)).toBe(0);
    expect(markAt(marks, [0.5, 0.52], 400, 400)).toBe(1);
    expect(markAt(marks, [0.8, 0.2], 400, 400)).toBe(2);
    expect(markAt(marks, [0.8, 0.45], 400, 400)).toBe(2);
    expect(markAt(marks, [0.5, 0.1], 400, 400)).toBe(3);
    expect(markAt(marks, [0.5, 0.9], 400, 400)).toBe(-1);
    // Two on top of each other: the one drawn last.
    expect(markAt([circle, { ...circle, color: 'white' }], [0.2, 0.2], 400, 400)).toBe(1);
    // By its line only: a tap in the middle of a big circle is free for a note or a number.
    const big: Mark = { tool: 'circle', color: 'red', from: [0.1, 0.1], to: [0.9, 0.9] };
    expect(markAt([big], [0.5, 0.5], 400, 400, 22, { inside: false })).toBe(-1);
    expect(markAt([big], [0.5, 0.11], 400, 400, 22, { inside: false })).toBe(0);
    expect(markAt([big], [0.5, 0.5], 400, 400)).toBe(0);
  });

  it('keeps a note near the edge on the photo, where its words can be read and tapped', () => {
    const edge: Mark = { tool: 'text', color: 'red', at: [0.99, 0.5], text: 'Install here' };
    const frame = markFrame(edge, 400, 400);
    expect(frame.x + frame.width).toBeLessThanOrEqual(400);
    expect(frame.x).toBeGreaterThan(200);
    const words = markShapes(edge, 400, 400).find((sh) => sh.type === 'text');
    expect(words && words.type === 'text' ? words.x : 0).toBeCloseTo(frame.x + frame.width / 2, 0);
    // A tap on the words where they show picks the note.
    expect(markAt([edge], [(frame.x + 8) / 400, 0.5], 400, 400)).toBe(0);
  });

  it('knows the box a mark takes up, words included', () => {
    const frame = markFrame(note, 400, 400);
    expect(frame.y).toBeLessThan(80);
    expect(frame.y + frame.height).toBeGreaterThan(280);
    expect(markFrame(spot, 400, 400)).toMatchObject({ x: 200 - 10.8, width: 21.6 });
  });

  it("finds the handle under a finger: an end, a corner, or a pointing note's words", () => {
    expect(markHandles(arrow).map((h) => h.handle)).toEqual(['from', 'to']);
    expect(handleAt(arrow, [0.65, 0.5], 400, 400)).toBe('to');
    expect(handleAt(arrow, [0.35, 0.51], 400, 400)).toBe('from');
    expect(handleAt(arrow, [0.5, 0.5], 400, 400)).toBeNull();
    expect(handleAt(circle, [0.3, 0.3], 400, 400)).toBe('to');
    expect(handleAt(note, [0.8, 0.7], 400, 400)).toBe('to');
    expect(handleAt(note, [0.8, 0.2], 400, 400)).toBe('at');
    // A plain note and a numbered spot only move.
    expect(handleAt({ tool: 'text', color: 'red', at: [0.5, 0.5], text: 'Gap' }, [0.5, 0.5], 400, 400)).toBeNull();
    expect(markHandles(spot)).toEqual([]);
  });
});

describe('changing a mark', () => {
  it('moves a whole mark, and stops it at the edge of the photo', () => {
    expect(moveMark(arrow, 0.1, -0.1)).toEqual({ ...arrow, from: [0.45, 0.4], to: [0.75, 0.4] });
    expect(moveMark(note, 0.5, 0)).toMatchObject({ at: [1, 0.2], to: [1, 0.7] });
    const pen: Mark = { tool: 'pen', color: 'red', points: [[0.1, 0.1], [0.2, 0.2]] };
    expect(moveMark(pen, -0.5, 0)).toEqual({ ...pen, points: [[0, 0.1], [0.1, 0.2]] });
  });

  it("drags one end of an arrow, a corner of a circle, or a note's words or its tip on their own", () => {
    expect(moveHandle(arrow, 'to', [0.9, 0.9])).toEqual({ ...arrow, to: [0.9, 0.9] });
    expect(moveHandle(circle, 'from', [0, 0])).toEqual({ ...circle, from: [0, 0] });
    expect(moveHandle(note, 'at', [0.5, 0.2])).toEqual({ ...note, at: [0.5, 0.2] });
    expect(moveHandle(note, 'to', [1.5, 0.9])).toEqual({ ...note, to: [1, 0.9] });
  });

  it('counts where a note points in the part of the photo marked, and tells Claude', () => {
    expect(markBounds([note])).toEqual([0.8, 0.2, 0.8, 0.7]);
    expect(describeMarks([note])).toEqual(['A note reading "Caulk" with an arrow pointing at the spot 80% across and 70% down.']);
  });
});
