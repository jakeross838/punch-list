// What the markup screen keeps while a photo is marked up, and every change to it: drawing a mark,
// picking one to move it, change its shape, color or words, or delete it, and Undo and Redo back
// and forth through every change. No phone parts here, so it is tested on its own.

import {
  addPenPoint,
  isTooSmall,
  measureText,
  nextNumber,
  tidyTitle,
  type Mark,
  type MarkColor,
  type MarkPoint,
  type MarkTool,
  type MeasureUnit,
} from '@punch/core';

export type TextMark = Extract<Mark, { tool: 'text' }>;
export type MeasureMark = Extract<Mark, { tool: 'measure' }>;

/**
 * The box open under the photo: a note's words, or a measurement's size. index: the mark being
 * changed, or null for a new one.
 */
export type Panel =
  | { kind: 'note'; draft: TextMark; index: number | null }
  | { kind: 'size'; draft: MeasureMark; index: number | null; text: string; unit: MeasureUnit };

export interface Markup {
  marks: Mark[];
  /** The marks before each change, for Undo, and the changes undone, for Redo. */
  past: Mark[][];
  future: Mark[][];
  /** A new mark under the finger. */
  live: Mark | null;
  /** The mark tapped to change it, and how it looks while a finger drags it. */
  picked: number | null;
  changing: Mark | null;
  panel: Panel | null;
  /** The unit picked last, so the next measurement starts with it. */
  unit: MeasureUnit;
}

export type MarkupAction =
  | { type: 'start'; mark: Mark }
  | { type: 'move'; at: MarkPoint }
  | { type: 'drop'; aspect: number }
  | { type: 'place'; mark: Mark }
  | { type: 'note'; at: MarkPoint; color: MarkColor }
  | { type: 'pick'; index: number | null }
  | { type: 'change'; mark: Mark }
  | { type: 'changed' }
  | { type: 'recolor'; color: MarkColor }
  | { type: 'remove' }
  | { type: 'edit' }
  | { type: 'type'; text: string }
  | { type: 'unit'; unit: MeasureUnit }
  | { type: 'add'; text?: string }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'redo' }
  /** The photo was cropped: its marks, moved with it, start a new history (Undo cannot reach past the crop). */
  | { type: 'cropped'; marks: Mark[] };

/** How many changes Undo goes back through. */
const HISTORY = 60;

export function startMarkup(marks: Mark[], unit: MeasureUnit = 'inches'): Markup {
  return { marks, past: [], future: [], live: null, picked: null, changing: null, panel: null, unit };
}

export const sameMarks = (a: Mark[] | Mark, b: Mark[] | Mark) => JSON.stringify(a) === JSON.stringify(b);

/** A new mark as a finger drags from one point to another with a tool. */
export function newMark(tool: MarkTool, color: MarkColor, from: MarkPoint, to: MarkPoint, marks: Mark[]): Mark {
  switch (tool) {
    case 'pen':
      return { tool, color, points: addPenPoint([from], to) };
    case 'number':
      // A spot goes where the finger is, so a drag places it exactly.
      return { tool, color, at: to, n: nextNumber(marks) };
    case 'text':
      // A note that points: its words where the drag started, its arrow's tip where the finger is.
      return { tool, color, at: from, to, text: '' };
    case 'measure':
      return { tool, color, from, to, text: '' };
    default:
      return { tool, color, from, to };
  }
}

/** Keeps a change, so Undo can take it back. */
function commit(s: Markup, marks: Mark[]): Markup {
  return { ...s, marks, past: [...s.past, s.marks].slice(-HISTORY), future: [] };
}

const replaced = (marks: Mark[], index: number, mark: Mark) => marks.map((m, i) => (i === index ? mark : m));

/** The marks without one. A numbered spot taken off moves the numbers after it down, so they stay in order. */
function without(marks: Mark[], index: number): Mark[] {
  const gone = marks[index];
  return marks
    .filter((_, i) => i !== index)
    .map((m) => (gone?.tool === 'number' && m.tool === 'number' && m.n > gone.n ? { ...m, n: m.n - 1 } : m));
}

function sized(panel: Extract<Panel, { kind: 'size' }>, text: string, unit: MeasureUnit): Panel {
  return { ...panel, text, unit, draft: { ...panel.draft, text: measureText(text, unit) } };
}

export function markupReducer(s: Markup, a: MarkupAction): Markup {
  switch (a.type) {
    case 'start':
      return s.panel ? s : { ...s, live: a.mark, picked: null, changing: null };
    case 'move': {
      const d = s.live;
      if (!d) return s;
      if (d.tool === 'pen') return { ...s, live: { ...d, points: addPenPoint(d.points, a.at) } };
      if (d.tool === 'number') return { ...s, live: { ...d, at: a.at } };
      return { ...s, live: { ...d, to: a.at } };
    }
    case 'drop': {
      const d = s.live;
      if (!d) return s;
      const done: Markup = { ...s, live: null };
      if (d.tool === 'text') {
        // A short drag was a tap: words with no arrow.
        const points = !!d.to && !isTooSmall({ tool: 'arrow', color: d.color, from: d.at, to: d.to }, a.aspect);
        const draft: TextMark = points ? d : { tool: 'text', color: d.color, at: d.at, text: d.text };
        return { ...done, panel: { kind: 'note', draft, index: null } };
      }
      if (isTooSmall(d, a.aspect)) return done;
      // A measurement asks for its size straight away.
      if (d.tool === 'measure') return { ...done, panel: { kind: 'size', draft: d, index: null, text: '', unit: s.unit } };
      return commit(done, [...s.marks, d]);
    }
    case 'place':
      return s.panel ? s : commit({ ...s, picked: null, changing: null }, [...s.marks, a.mark]);
    case 'note':
      return s.panel ? s : { ...s, picked: null, changing: null, panel: { kind: 'note', draft: { tool: 'text', color: a.color, at: a.at, text: '' }, index: null } };
    case 'pick':
      return { ...s, picked: a.index !== null && s.marks[a.index] ? a.index : null, changing: null };
    case 'change':
      return s.picked === null ? s : { ...s, changing: a.mark };
    case 'changed': {
      const { picked, changing } = s;
      const was = picked === null ? undefined : s.marks[picked];
      if (picked === null || !changing || !was || sameMarks(changing, was)) return { ...s, changing: null };
      return { ...commit(s, replaced(s.marks, picked, changing)), changing: null };
    }
    case 'recolor': {
      const was = s.picked === null ? undefined : s.marks[s.picked];
      if (s.picked === null || !was || was.color === a.color) return s;
      return commit(s, replaced(s.marks, s.picked, { ...was, color: a.color }));
    }
    case 'remove':
      return s.picked === null || !s.marks[s.picked] ? s : { ...commit(s, without(s.marks, s.picked)), picked: null, changing: null };
    case 'edit': {
      const m = s.picked === null ? undefined : s.marks[s.picked];
      if (m?.tool === 'text') return { ...s, changing: null, panel: { kind: 'note', draft: m, index: s.picked } };
      if (m?.tool === 'measure') return { ...s, changing: null, panel: { kind: 'size', draft: m, index: s.picked, text: m.text, unit: s.unit } };
      return s;
    }
    case 'type': {
      const p = s.panel;
      if (p?.kind === 'note') return { ...s, panel: { ...p, draft: { ...p.draft, text: a.text } } };
      if (p?.kind === 'size') return { ...s, panel: sized(p, a.text, p.unit) };
      return s;
    }
    case 'unit':
      return s.panel?.kind === 'size' ? { ...s, unit: a.unit, panel: sized(s.panel, s.panel.text, a.unit) } : s;
    case 'add': {
      const p = s.panel;
      if (!p) return s;
      const closed: Markup = { ...s, panel: null };
      let mark: Mark = p.draft;
      if (p.kind === 'note') {
        const text = tidyTitle(a.text ?? p.draft.text);
        // Nothing written: no note, and a note being changed keeps its words.
        if (!text) return closed;
        mark = { ...p.draft, text };
      }
      if (p.index === null) return commit(closed, [...s.marks, mark]);
      const was = s.marks[p.index];
      return !was || sameMarks(was, mark) ? closed : commit(closed, replaced(s.marks, p.index, mark));
    }
    case 'cancel':
      return { ...s, panel: null };
    case 'undo': {
      const last = s.past[s.past.length - 1];
      if (!last || s.panel) return s;
      return { ...s, marks: last, past: s.past.slice(0, -1), future: [s.marks, ...s.future], live: null, picked: null, changing: null };
    }
    case 'redo': {
      const [next, ...rest] = s.future;
      if (!next || s.panel) return s;
      return { ...s, marks: next, past: [...s.past, s.marks], future: rest, live: null, picked: null, changing: null };
    }
    case 'cropped':
      return { ...s, marks: a.marks, past: [], future: [], live: null, picked: null, changing: null, panel: null };
  }
}

/**
 * The marks as they look right now: a mark being dragged where the finger is, a note or a size as
 * it is typed, and a new mark under the finger. A note with nothing written yet shows empty, a
 * label waiting for its words.
 */
export function shownMarks(s: Markup, empty = '\u2026'): Mark[] {
  let list = s.marks;
  if (s.picked !== null && s.changing) list = replaced(list, s.picked, s.changing);
  const p = s.panel;
  if (p) {
    const draft: Mark = p.kind === 'note' && !p.draft.text.trim() ? { ...p.draft, text: empty } : p.draft;
    list = p.index === null ? [...list, draft] : replaced(list, p.index, draft);
  }
  const { live } = s;
  if (!live) return list;
  return [...list, live.tool === 'text' && !live.text ? { ...live, text: empty } : live];
}

/** The picked mark as it looks right now, or null: none picked, or its words are open. */
export function pickedMark(s: Markup): Mark | null {
  if (s.picked === null || s.panel) return null;
  return s.changing ?? s.marks[s.picked] ?? null;
}
