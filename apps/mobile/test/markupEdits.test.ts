// The markup screen's changes: drawing, picking a mark to change it, words and sizes, and Undo and Redo.

import { describe, expect, it } from 'vitest';
import type { Mark } from '@punch/core';
import { markupReducer as edit, newMark, pickedMark, shownMarks, startMarkup, type Markup, type MarkupAction } from '../src/components/markupEdits';

const run = (s: Markup, ...actions: MarkupAction[]) => actions.reduce(edit, s);
const circle: Mark = { tool: 'circle', color: 'red', from: [0.2, 0.2], to: [0.5, 0.5] };

describe('drawing', () => {
  it('keeps a drag, and lets a tap with the circle go', () => {
    const s = run(startMarkup([]), { type: 'start', mark: newMark('circle', 'red', [0.2, 0.2], [0.2, 0.2], []) }, { type: 'move', at: [0.5, 0.5] }, { type: 'drop', aspect: 1 });
    expect(s.marks).toEqual([circle]);
    expect(s.past).toEqual([[]]);
    const tap = run(startMarkup([]), { type: 'start', mark: newMark('circle', 'red', [0.2, 0.2], [0.201, 0.2], []) }, { type: 'drop', aspect: 1 });
    expect(tap.marks).toEqual([]);
    expect(tap.past).toEqual([]);
  });

  it('shows the mark under the finger before it is kept', () => {
    const s = run(startMarkup([circle]), { type: 'start', mark: newMark('arrow', 'red', [0.1, 0.9], [0.3, 0.6], []) });
    expect(shownMarks(s)).toHaveLength(2);
    expect(s.marks).toHaveLength(1);
  });

  it('opens the words for a note that points, with its arrow kept', () => {
    const s = run(startMarkup([]), { type: 'start', mark: newMark('text', 'red', [0.2, 0.8], [0.5, 0.4], []) }, { type: 'drop', aspect: 1 });
    expect(s.panel).toMatchObject({ kind: 'note', index: null, draft: { at: [0.2, 0.8], to: [0.5, 0.4] } });
    const added = run(s, { type: 'type', text: 'crack at the corner' }, { type: 'add' });
    expect(added.marks).toEqual([{ tool: 'text', color: 'red', at: [0.2, 0.8], to: [0.5, 0.4], text: 'Crack at the corner' }]);
    expect(added.panel).toBeNull();
  });

  it('shows a note waiting for its words', () => {
    const s = run(startMarkup([]), { type: 'note', at: [0.5, 0.5], color: 'red' });
    expect(shownMarks(s)).toEqual([{ tool: 'text', color: 'red', at: [0.5, 0.5], text: '\u2026' }]);
    expect(shownMarks(run(s, { type: 'type', text: 'Ga' }))[0]).toMatchObject({ text: 'Ga' });
  });

  it('makes a short drag with the note plain words, and a quick word adds it at once', () => {
    const s = run(startMarkup([]), { type: 'start', mark: newMark('text', 'red', [0.2, 0.8], [0.202, 0.8], []) }, { type: 'drop', aspect: 1 }, { type: 'add', text: 'Gap' });
    expect(s.marks).toEqual([{ tool: 'text', color: 'red', at: [0.2, 0.8], text: 'Gap' }]);
  });

  it('adds no note when nothing was written', () => {
    const s = run(startMarkup([]), { type: 'note', at: [0.5, 0.5], color: 'red' }, { type: 'type', text: '   ' }, { type: 'add' });
    expect(s.marks).toEqual([]);
    expect(s.past).toEqual([]);
  });

  it('writes out a measurement as its size is typed, and Cancel drops it', () => {
    const s = run(startMarkup([]), { type: 'start', mark: newMark('measure', 'red', [0.1, 0.5], [0.9, 0.5], []) }, { type: 'drop', aspect: 1 }, { type: 'type', text: '30' });
    expect(shownMarks(s)[0]).toMatchObject({ tool: 'measure', text: '30 inches' });
    expect(run(s, { type: 'unit', unit: 'feet' }).panel).toMatchObject({ draft: { text: '30 feet' } });
    expect(run(s, { type: 'unit', unit: 'feet' }).unit).toBe('feet');
    expect(run(s, { type: 'add' }).marks).toEqual([{ tool: 'measure', color: 'red', from: [0.1, 0.5], to: [0.9, 0.5], text: '30 inches' }]);
    expect(run(s, { type: 'cancel' }).marks).toEqual([]);
  });

  it('numbers spots in order', () => {
    let s = startMarkup([]);
    for (const x of [0.2, 0.5, 0.8]) s = edit(s, { type: 'place', mark: newMark('number', 'red', [x, 0.5], [x, 0.5], s.marks) });
    expect(s.marks.map((m) => (m.tool === 'number' ? m.n : 0))).toEqual([1, 2, 3]);
  });
});

describe('picking a mark to change it', () => {
  it('moves a mark while dragged, and keeps the change once let go', () => {
    const moved: Mark = { ...circle, from: [0.3, 0.3], to: [0.6, 0.6] };
    const s = run(startMarkup([circle]), { type: 'pick', index: 0 }, { type: 'change', mark: moved });
    expect(shownMarks(s)).toEqual([moved]);
    expect(pickedMark(s)).toEqual(moved);
    expect(s.marks).toEqual([circle]);
    const kept = run(s, { type: 'changed' });
    expect(kept.marks).toEqual([moved]);
    expect(kept.picked).toBe(0);
    expect(kept.past).toEqual([[circle]]);
  });

  it('keeps no change when a picked mark was only tapped', () => {
    const s = run(startMarkup([circle]), { type: 'pick', index: 0 }, { type: 'change', mark: { ...circle } }, { type: 'changed' });
    expect(s.past).toEqual([]);
  });

  it('gives the picked mark another color', () => {
    const s = run(startMarkup([circle]), { type: 'pick', index: 0 }, { type: 'recolor', color: 'yellow' });
    expect(s.marks[0]).toMatchObject({ color: 'yellow' });
    expect(run(s, { type: 'recolor', color: 'yellow' }).past).toHaveLength(1);
  });

  it('changes a note’s words, keeping its arrow and the words when the box is left empty', () => {
    const note: Mark = { tool: 'text', color: 'red', at: [0.2, 0.8], to: [0.5, 0.4], text: 'Gap' };
    const s = run(startMarkup([circle, note]), { type: 'pick', index: 1 }, { type: 'edit' });
    expect(s.panel).toMatchObject({ kind: 'note', index: 1 });
    expect(pickedMark(s)).toBeNull();
    expect(run(s, { type: 'type', text: 'Gap at the base' }, { type: 'add' }).marks[1]).toEqual({ ...note, text: 'Gap at the base' });
    expect(run(s, { type: 'type', text: '' }, { type: 'add' }).marks[1]).toEqual(note);
    expect(run(s, { type: 'add' }).past).toEqual([]);
  });

  it('changes a measurement’s size', () => {
    const size: Mark = { tool: 'measure', color: 'red', from: [0.1, 0.5], to: [0.9, 0.5], text: '30 inches' };
    const s = run(startMarkup([size]), { type: 'pick', index: 0 }, { type: 'edit' });
    expect(s.panel).toMatchObject({ kind: 'size', text: '30 inches' });
    expect(run(s, { type: 'type', text: `2'6"` }, { type: 'add' }).marks[0]).toMatchObject({ text: '2 feet 6 inches' });
  });

  it('deletes the picked mark, and numbers after a deleted spot move down', () => {
    const spots: Mark[] = [1, 2, 3].map((n) => ({ tool: 'number', color: 'red', at: [n / 4, 0.5], n }));
    const s = run(startMarkup(spots), { type: 'pick', index: 1 }, { type: 'remove' });
    expect(s.marks.map((m) => (m.tool === 'number' ? m.n : 0))).toEqual([1, 2]);
    expect(s.picked).toBeNull();
  });

  it('lets go of the pick when a new mark is drawn', () => {
    const s = run(startMarkup([circle]), { type: 'pick', index: 0 }, { type: 'start', mark: newMark('arrow', 'red', [0.8, 0.8], [0.9, 0.9], []) });
    expect(s.picked).toBeNull();
  });
});

describe('Undo and Redo', () => {
  it('goes back and forth through every change', () => {
    const arrow: Mark = { tool: 'arrow', color: 'red', from: [0.8, 0.8], to: [0.6, 0.6] };
    let s = run(startMarkup([]), { type: 'place', mark: circle }, { type: 'place', mark: arrow }, { type: 'pick', index: 0 }, { type: 'recolor', color: 'white' });
    expect(s.marks).toEqual([{ ...circle, color: 'white' }, arrow]);
    s = run(s, { type: 'undo' });
    expect(s.marks).toEqual([circle, arrow]);
    expect(s.picked).toBeNull();
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(s.marks).toEqual([]);
    expect(run(s, { type: 'undo' })).toBe(s);
    s = run(s, { type: 'redo' }, { type: 'redo' });
    expect(s.marks).toEqual([circle, arrow]);
    // A new change after an undo: the changes undone are gone.
    s = run(s, { type: 'place', mark: { ...circle, color: 'black' } });
    expect(s.future).toEqual([]);
    expect(run(s, { type: 'redo' })).toBe(s);
  });

  it('waits while words are being typed', () => {
    const s = run(startMarkup([]), { type: 'place', mark: circle }, { type: 'note', at: [0.5, 0.5], color: 'red' });
    expect(run(s, { type: 'undo' })).toBe(s);
  });
});
