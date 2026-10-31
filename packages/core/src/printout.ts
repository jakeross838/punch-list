// The lists as printed pages, to the house document standard: US Letter, Nunito Sans at 10 point,
// the five house colors, and tables that carry the content (dark slate header rows, light blue
// group bands, white and cream rows).
//
// A company's list: each scheduled visit with the items on it, then what is ready now and not
// scheduled, then what is waiting, grouped by what it waits on, each group with a line for the days
// it takes (one duration per batch, as the schedule bars carry), then additional work that needs a
// price, then blank lines to add anything missing. Items new since the last list say so. The owner's
// list says what Ross Built needs from them and by when. The whole job list goes location by
// location with the trade and company on every line. A list made to order takes any filters,
// groups by location, trade, company or what it waits on, shows the details picked on every line,
// and totals each group's estimated time. The three week look ahead is the schedule for everyone:
// each company's visits across the next three weeks, green once confirmed and blue for our best
// guess, what each visit covers, and what has no date yet.
// Plain HTML, so the phone turns it into a PDF and the preview page shows the very same thing.

import { addDays, dayOfDate, daysBetween, isDay, mondayOf, visitEnd } from './dates';
import { KIND_LABELS } from './forms';
import { holdText } from './holds';
import { holdsFor, type CompanyList, type ListLine, type ListLookups } from './lists';
import { timelineRows, workingIndex, type Timeline, type TimelineBar } from './timeline';
import { markShapes, type MarkShape } from './marks';
import { isPriced } from './rules';
import { daysText, hoursText, totalText, totalTime } from './time';
import type { Item, Mark, Visit } from './types';
import { itemNumberLabel } from './views';
import { waitingOnText } from './waitingOn';

/** The first photo of an item, ready to print: its picture (a data or file address) and its marks. */
export interface PrintPhoto {
  src: string;
  width: number;
  height: number;
  marks: Mark[];
}

export interface PrintSettings {
  job: { name: string; address: string };
  /** The day the list is made. */
  date: Date;
  /** An item's photo, when photos are included. */
  photo?: (itemId: string) => PrintPhoto | undefined;
  /** Items that were not on the last list sent. */
  isNew?: (itemId: string) => boolean;
  /** The company's scheduled visits; their items print under them instead of under Ready Now. */
  visits?: Visit[];
  /** Each item's comments to print, oldest first: only ones the company may see, never Ross Built only notes. */
  comments?: (itemId: string) => PrintComment[];
  /** Comments on the company's whole list, the same way. */
  listComments?: PrintComment[];
}

/** A comment ready to print: who wrote it, when (an ISO time) and what it says. */
export interface PrintComment {
  who: string;
  at: string;
  body: string;
}

export interface Printout {
  /** What the list is, for the preview and the share sheet: "SMS Carpentry". */
  title: string;
  /** The PDF's name: "Fish Completion List for SMS Carpentry, October 30 2026.pdf". */
  fileName: string;
  /** The heading in the page's top corner, for the page footer too: "Completion List". */
  kind: string;
  /** The page's content, laid out by PRINT_CSS inside an element with the class rb-doc. */
  body: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "October 30, 2026" */
export function printDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** A day as it reads on a list: "November 2", with the year only when it is not this one. The month and day never break apart. */
function dayText(ymd: string, today: Date, weekday = false): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const name = weekday ? `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ` : '';
  return `${name}${MONTHS[m - 1]}\u00a0${d}${y === today.getFullYear() ? '' : `, ${y}`}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 ready now, 4 waiting and 1 that needs a price" */
function andList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const esc = escapeHtml;

/** A file name the phone and every mail program accept. */
function safeName(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function shapeSvg(s: MarkShape): string {
  switch (s.type) {
    case 'path':
      return `<path d="${s.d}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="${s.fill ?? 'none'}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'ellipse':
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="${s.fill ?? 'none'}"/>`;
    case 'rect':
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"${s.rx ? ` rx="${s.rx}"` : ''} stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="${s.fill ?? 'none'}" stroke-linejoin="round"/>`;
    case 'text': {
      const anchor = s.anchor ? ` text-anchor="${s.anchor}"` : '';
      return `<text x="${s.x}" y="${s.y}" fill="${s.fill}" font-size="${s.fontSize}" font-weight="600"${anchor}>${esc(s.text)}</text>`;
    }
  }
}

/** Photo width on the page, in inches. Tall photos stop at PHOTO_MAX and crop a little. */
const PHOTO_WIDTH = 1.15;
const PHOTO_MAX = 1.45;

function photoCell(photo: PrintPhoto | undefined): string {
  if (!photo) return '';
  // The marks are drawn on a frame the photo's own shape, cropped the same way as the picture.
  const w = 1000;
  const h = Math.max(1, Math.round((w * photo.height) / (photo.width || 1)));
  const height = Math.min(PHOTO_MAX, (PHOTO_WIDTH * h) / w).toFixed(2);
  const shapes = photo.marks.flatMap((m) => markShapes(m, w, h));
  const svg = shapes.length > 0 ? `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${shapes.map(shapeSvg).join('')}</svg>` : '';
  return `<div class="rb-ph" style="height:${height}in"><img src="${esc(photo.src)}" alt="">${svg}</div>`;
}

/** The item number, and New when it was not on the last list. */
function numberCell(line: ListLine, settings: PrintSettings): string {
  const isNew = settings.isNew?.(line.item.id) ? '<div class="rb-new">New</div>' : '';
  return `${esc(itemNumberLabel(line.item))}${isNew}`;
}

/** Comments under an item, or under a list's heading: who, the day, and what they said. */
function commentsHtml(list: PrintComment[] | undefined, today: Date): string {
  if (!list || list.length === 0) return '';
  const one = (c: PrintComment) =>
    `<div class="rb-comment"><b>${esc(c.who)}</b>, ${esc(dayText(dayOfDate(new Date(c.at)), today))}: ${esc(c.body).replace(/\n/g, '<br>')}</div>`;
  return `<div class="rb-comments">${list.map(one).join('')}</div>`;
}

/** The title, then where exactly, then for additional work its order number or that it needs a price, then its comments. */
function workCell(line: ListLine, settings: PrintSettings): string {
  const { item } = line;
  const parts = [`<div class="rb-work">${esc(item.title)}</div>`];
  if (item.description) parts.push(`<div class="rb-desc">${esc(item.description)}</div>`);
  if (item.kind === 'added_scope') {
    const note = item.poOrCo ? `Additional, ${item.poOrCo}` : 'Additional, needs a price';
    parts.push(`<div class="rb-note">${esc(note)}</div>`);
  }
  parts.push(commentsHtml(settings.comments?.(item.id), settings.date));
  return parts.join('');
}

/** Ready, or what it waits on and when it should be ready; past due only by its own Ready By. */
function readyCell(line: ListLine, today: Date): string {
  const { item } = line;
  if (item.ready) return 'Ready';
  let text = `Waiting on ${line.waiting || 'something not named'}`;
  if (isDay(line.readyBy)) {
    text += `, ready by ${dayText(line.readyBy, today)}`;
    const late = line.readyBy === item.readyBy ? daysBetween(line.readyBy, dayOfDate(today)) : 0;
    if (late > 0) return `${esc(text)}, <span class="rb-late">${late} ${late === 1 ? 'day' : 'days'} past due</span>`;
  }
  return esc(text);
}

function header(settings: PrintSettings, kind: string, title: string, summary: string): string {
  const { job, date } = settings;
  return [
    '<div class="rb-head">',
    '<div class="rb-brand"><div class="rb-brand-name">ROSS BUILT</div><div class="rb-brand-sub">CUSTOM HOMES</div></div>',
    `<div class="rb-head-right"><b>${esc(kind)}</b>${esc(printDate(date))}</div>`,
    '</div>',
    `<h1 class="rb-title">${esc(title)}</h1>`,
    `<p class="rb-job">${esc([job.name, job.address].filter(Boolean).join(', '))}</p>`,
    `<p class="rb-summary">${esc(summary)}</p>`,
  ].join('');
}

interface Column {
  label: string;
  width?: string;
  cell: (line: ListLine) => string;
  className?: string;
}

function table(columns: { label: string; width?: string }[], body: string): string {
  const cols = columns.map((c) => `<col${c.width ? ` style="width:${c.width}"` : ''}>`).join('');
  const head = columns.map((c) => `<th>${esc(c.label)}</th>`).join('');
  return `<table class="rb-table"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function rows(columns: Column[], lines: ListLine[], start = 0): string {
  return lines
    .map((line, i) => {
      const cells = columns.map((c) => `<td${c.className ? ` class="${c.className}"` : ''}>${c.cell(line)}</td>`).join('');
      return `<tr class="rb-row${(start + i) % 2 === 1 ? ' rb-alt' : ''}">${cells}</tr>`;
    })
    .join('');
}

const band = (span: number, text: string) => `<tr class="rb-band"><td colspan="${span}">${esc(text)}</td></tr>`;
const blanks = (span: number, count: number) =>
  Array.from({ length: count }, () => `<tr class="rb-blank">${'<td></td>'.repeat(span)}</tr>`).join('');

/** A line for the sub to write how many days a batch takes: one duration per batch. */
const daysLine = (span: number, count: number) =>
  `<tr class="rb-days"><td colspan="${span}">How many days for ${count === 1 ? 'this item' : `these ${count} items`}?<span class="rb-fill"></span></td></tr>`;

const photoColumn = (settings: PrintSettings): Column[] =>
  settings.photo ? [{ label: 'Photo', width: `${PHOTO_WIDTH + 0.16}in`, cell: (l: ListLine) => photoCell(settings.photo?.(l.item.id)) }] : [];

/** One company's list, for the sub. */
export function companyPrintout(list: CompanyList, settings: PrintSettings): Printout {
  const columns: Column[] = [
    { label: 'Item', width: '0.55in', cell: (l) => numberCell(l, settings), className: 'rb-num' },
    { label: 'Location', width: '1.3in', cell: (l) => esc(l.room) },
    { label: 'Work', cell: (l) => workCell(l, settings) },
    ...photoColumn(settings),
  ];
  const span = columns.length;

  // Items on a scheduled visit print under the visit, not again under Ready Now or Waiting.
  const all = [...list.ready, ...list.waiting.flatMap((g) => g.lines), ...list.needsPrice];
  const planned = (settings.visits ?? [])
    .filter((v) => !v.removed)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((visit) => ({ visit, lines: all.filter((l) => l.item.visitId === visit.id) }))
    .filter((v) => v.lines.length > 0);
  const booked = new Set(planned.flatMap((v) => v.lines.map((l) => l.item.id)));
  const ready = list.ready.filter((l) => !booked.has(l.item.id));
  const waiting = list.waiting
    .map((g) => ({ ...g, lines: g.lines.filter((l) => !booked.has(l.item.id)) }))
    .filter((g) => g.lines.length > 0);
  const needsPrice = list.needsPrice.filter((l) => !booked.has(l.item.id));

  const waitingCount = waiting.reduce((n, g) => n + g.lines.length, 0);
  const counts = [
    booked.size > 0 ? `${booked.size} scheduled` : '',
    ready.length > 0 ? `${ready.length} ready now` : '',
    waitingCount > 0 ? `${waitingCount} waiting` : '',
    needsPrice.length > 0 ? `${needsPrice.length} ${needsPrice.length === 1 ? 'that needs' : 'that need'} a price` : '',
  ].filter(Boolean);
  const summary =
    list.open === 0
      ? 'nothing open right now.'
      : counts.length === 1 && ready.length === list.open
        ? `${plural(list.open, 'open item')}, all ready now.`
        : `${plural(list.open, 'open item')}, ${andList(counts)}.`;
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const trades = list.trades.length > 0 ? `${waitingOnText(list.trades)}: ${summary}` : sentence(summary);
  const parts = [header(settings, 'Completion List', list.company, trades)];

  if (settings.listComments && settings.listComments.length > 0) {
    parts.push('<h2 class="rb-section">Comments</h2>');
    parts.push(commentsHtml(settings.listComments, settings.date));
  }

  if (planned.length > 0) {
    parts.push('<h2 class="rb-section">Scheduled Visits</h2>');
    parts.push('<p class="rb-section-note">Tell us if these dates do not work for you.</p>');
    const body = planned
      .map(({ visit, lines }) => {
        const end = visitEnd(visit);
        const when = end === visit.start ? dayText(visit.start, settings.date, true) : `${dayText(visit.start, settings.date, true)} to ${dayText(end, settings.date, true)}`;
        return band(span, `${when}, ${plural(visit.days, 'day')}, ${visit.confirmed ? 'confirmed' : 'our best guess'}`) + rows(columns, lines);
      })
      .join('');
    parts.push(table(columns, body));
  }

  // With visits scheduled and nothing else ready, the section is left off.
  if (ready.length > 0 || planned.length === 0) {
    parts.push(`<h2 class="rb-section">${planned.length > 0 ? 'Ready, Not Scheduled Yet' : 'Ready'}</h2>`);
    if (ready.length > 0) {
      parts.push('<p class="rb-section-note">These can be done any time.</p>');
      parts.push(table(columns, rows(columns, ready) + daysLine(span, ready.length)));
    } else {
      parts.push('<p class="rb-section-note">Nothing is ready yet.</p>');
    }
  }

  if (waiting.length > 0) {
    parts.push('<h2 class="rb-section">Waiting</h2>');
    const body = waiting
      .map(
        (g) =>
          band(span, `Waiting on ${g.on}${g.readyBy ? `, ready by ${dayText(g.readyBy, settings.date)}` : ''}`) +
          rows(columns, g.lines) +
          daysLine(span, g.lines.length),
      )
      .join('');
    parts.push(table(columns, body));
  }

  if (needsPrice.length > 0) {
    parts.push('<h2 class="rb-section">Needs a Price</h2>');
    parts.push('<p class="rb-section-note">Additional work we need a price for before it is scheduled.</p>');
    parts.push(table(columns, rows(columns, needsPrice)));
  }

  const added = columns.filter((c) => c.label !== 'Photo');
  parts.push('<h2 class="rb-section">Anything Missing</h2>');
  parts.push('<p class="rb-section-note">Add anything not on this list.</p>');
  parts.push(table(added, blanks(added.length, 6)));

  return {
    title: list.company,
    kind: 'Completion List',
    fileName: `${safeName(`${settings.job.name} Completion List for ${list.company}, ${printDate(settings.date).replace(',', '')}`)}.pdf`,
    body: parts.join(''),
  };
}

/** What Ross Built needs from the owner or the design team, the soonest needed first. */
export function partyPrintout(party: string, lines: ListLine[], settings: PrintSettings): Printout {
  const columns: Column[] = [
    { label: 'Item', width: '0.55in', cell: (l) => numberCell(l, settings), className: 'rb-num' },
    { label: 'Location', width: '1.3in', cell: (l) => esc(l.room) },
    { label: 'Work', cell: (l) => workCell(l, settings) },
    { label: 'Needed By', width: '1.05in', cell: (l) => esc(isDay(l.readyBy) ? dayText(l.readyBy, settings.date) : 'When you can') },
    ...photoColumn(settings),
  ];
  const summary =
    lines.length === 0
      ? 'Nothing is waiting on you right now.'
      : `${lines.length === 1 ? 'This item is' : `These ${lines.length} items are`} waiting on your answer.`;
  const parts = [header(settings, 'Decisions Needed', party, summary)];
  if (lines.length > 0) {
    parts.push('<h2 class="rb-section">Decisions Needed</h2>');
    parts.push('<p class="rb-section-note">An answer by the date shown keeps the work on schedule.</p>');
    parts.push(table(columns, rows(columns, lines)));
  }
  return {
    title: party,
    kind: 'Decisions Needed',
    fileName: `${safeName(`${settings.job.name} Decisions Needed for ${party}, ${printDate(settings.date).replace(',', '')}`)}.pdf`,
    body: parts.join(''),
  };
}

// ---------- a list made to order ----------

export type ListGroupBy = 'location' | 'trade' | 'company' | 'waiting';
export type ListDetail = 'description' | 'location' | 'company' | 'trade' | 'type' | 'status' | 'time' | 'comments' | 'photo';

export const LIST_GROUP_LABELS: Record<ListGroupBy, string> = { location: 'Location', trade: 'Trade', company: 'Company', waiting: 'Waiting On' };

/** What each line can show, in the order the sheet offers them. */
export const LIST_DETAILS: { detail: ListDetail; label: string }[] = [
  { detail: 'description', label: 'Description' },
  { detail: 'location', label: 'Location' },
  { detail: 'company', label: 'Company' },
  { detail: 'trade', label: 'Trade' },
  { detail: 'type', label: 'Type' },
  { detail: 'status', label: 'Ready or Waiting' },
  { detail: 'time', label: 'Estimated Time' },
  { detail: 'comments', label: 'Comments' },
  { detail: 'photo', label: 'Photo' },
];

/** How a list made to order is laid out. */
export interface ListDesign {
  /** The title on the page; empty for the one the filters suggest. */
  title: string;
  groupBy: ListGroupBy;
  /** What each line shows, besides the item number and the title. */
  details: ListDetail[];
  /** A line under each group for the company to write how many days it takes. */
  daysLines: boolean;
  /** Blank lines under each group, to add anything missing. */
  blankLines: boolean;
}

export const DEFAULT_LIST_DESIGN: ListDesign = {
  title: '',
  groupBy: 'location',
  details: ['description', 'company', 'trade', 'type', 'status', 'time', 'comments', 'photo'],
  daysLines: false,
  blankLines: false,
};

export interface CustomPrintSettings extends PrintSettings {
  /** The filters the list was made with, in words: "Ready", "SMS Carpentry". */
  filters?: string[];
}

/** The type of work in words: "Deficiency", "Additional, CO-14", "Additional, needs a price". */
function kindWords(item: Pick<Item, 'kind' | 'poOrCo'>): string {
  if (item.kind !== 'added_scope') return KIND_LABELS[item.kind];
  return isPriced(item) ? `Additional, ${item.poOrCo}` : 'Additional, needs a price';
}

interface LineGroup {
  label: string;
  /** The level, when grouped by location. */
  floor?: string;
  lines: ListLine[];
}

/** Open items first, then completed ones, each in the order given. */
const openFirst = (lines: ListLine[]) => [...lines.filter((l) => l.item.status !== 'complete'), ...lines.filter((l) => l.item.status === 'complete')];

function groupLines(lines: ListLine[], by: ListGroupBy): LineGroup[] {
  const groups = new Map<string, LineGroup & { readyBy?: string | null; order: number }>();
  const add = (key: string, label: string, line: ListLine, order: number, extra: Partial<LineGroup & { readyBy: string | null }> = {}) => {
    const group = groups.get(key) ?? { label, lines: [], order, ...extra };
    group.lines.push(line);
    if (extra.readyBy && (!group.readyBy || extra.readyBy < group.readyBy)) group.readyBy = extra.readyBy;
    groups.set(key, group);
  };
  for (const line of lines) {
    const { item } = line;
    switch (by) {
      case 'location':
        add(item.locationId, line.room, line, 0, { floor: line.floor });
        break;
      case 'trade':
        add(line.trade, line.trade, line, line.trade === 'Not set' ? 1 : 0);
        break;
      case 'company':
        add(line.company, line.company, line, line.company === 'Not set' ? 1 : 0);
        break;
      case 'waiting': {
        if (item.status === 'complete') add('complete', 'Completed', line, 4);
        else if (!isPriced(item)) add('price', 'Needs a Price', line, 3);
        else if (item.ready) add('ready', 'Ready', line, 0);
        else {
          const on = line.waitingGroup || 'something not named';
          add(`waiting:${on.toLowerCase()}`, `Waiting on ${on}`, line, 1, { readyBy: isDay(line.readyBy) ? line.readyBy : null });
        }
        break;
      }
    }
  }
  const list = [...groups.values()];
  if (by === 'trade' || by === 'company') list.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  if (by === 'waiting') {
    list.sort(
      (a, b) => a.order - b.order || (a.readyBy ?? '9999').localeCompare(b.readyBy ?? '9999') || b.lines.length - a.lines.length || a.label.localeCompare(b.label),
    );
  }
  return list.map((g) => ({ label: g.label, floor: g.floor, lines: openFirst(g.lines) }));
}

/** A list made to order: the items given (filtered already, in floor order), laid out as designed. */
export function customPrintout(lines: ListLine[], design: ListDesign, settings: CustomPrintSettings): Printout {
  const has = (d: ListDetail) => design.details.includes(d);
  const today = settings.date;
  const work = (line: ListLine) => {
    const { item } = line;
    const parts = [`<div class="rb-work">${esc(item.title)}</div>`];
    if (has('description') && item.description) parts.push(`<div class="rb-desc">${esc(item.description)}</div>`);
    const meta = [has('location') ? line.room : null, has('company') ? line.company : null, has('trade') ? line.trade : null, has('type') ? kindWords(item) : null]
      .filter((x): x is string => !!x)
      .join(' \u00b7 ');
    if (meta) parts.push(`<div class="rb-meta">${esc(meta)}</div>`);
    // Whether additional work is priced always shows: it decides whether it can be scheduled.
    if (!has('type') && item.kind === 'added_scope') parts.push(`<div class="rb-note">${esc(kindWords(item))}</div>`);
    if (has('comments')) parts.push(commentsHtml(settings.comments?.(item.id), today));
    return parts.join('');
  };
  const status = (line: ListLine) =>
    line.item.status === 'complete' && line.item.completedAt ? esc(`Completed ${dayText(line.item.completedAt.slice(0, 10), today)}`) : readyCell(line, today);
  const time = (line: ListLine) => (line.item.hours !== null ? esc(hoursText(line.item.hours)) : '<span class="rb-quiet">Not estimated</span>');
  const columns: Column[] = [
    { label: 'Item', width: '0.5in', cell: (l) => numberCell(l, settings), className: 'rb-num' },
    { label: 'Work', cell: work },
    ...(has('status') ? [{ label: 'Ready', width: '1.45in', cell: status, className: 'rb-small' }] : []),
    ...(has('time') ? [{ label: 'Time', width: '0.85in', cell: time, className: 'rb-small' }] : []),
    ...(has('photo') ? photoColumn(settings) : []),
  ];
  const span = columns.length;
  const openOf = (list: ListLine[]) => list.filter((l) => l.item.status === 'open');
  const bandText = (group: LineGroup) => {
    const parts = [group.label, plural(group.lines.length, 'item')];
    const t = totalTime(openOf(group.lines).map((l) => l.item));
    if (has('time') && t.timed + t.untimed > 0) parts.push(totalText(t));
    return parts.join(' \u00b7 ');
  };
  const groupBody = (group: LineGroup) => {
    const open = openOf(group.lines).length;
    return (
      band(span, bandText(group)) +
      rows(columns, group.lines) +
      (design.daysLines && open > 0 ? daysLine(span, open) : '') +
      (design.blankLines ? blanks(span, 2) : '')
    );
  };

  const title = design.title.trim() || 'Whole Job';
  const open = openOf(lines);
  const done = lines.length - open.length;
  const places = new Set(lines.map((l) => l.item.locationId)).size;
  const price = open.filter((l) => !isPriced(l.item)).length;
  const ready = open.filter((l) => l.item.ready && isPriced(l.item)).length;
  const waiting = open.length - ready - price;
  const t = totalTime(open.map((l) => l.item));
  const counts = [
    ready > 0 ? `${ready} ready now` : '',
    waiting > 0 ? `${waiting} waiting` : '',
    price > 0 ? `${price} ${price === 1 ? 'that needs' : 'that need'} a price` : '',
  ].filter(Boolean);
  const sentences: string[] = [];
  if (lines.length === 0) sentences.push('Nothing matches right now.');
  else if (open.length > 0) sentences.push(`${plural(open.length, 'open item')} in ${plural(places, 'location')}: ${andList(counts)}.`);
  else sentences.push(`${plural(done, 'completed item')} in ${plural(places, 'location')}.`);
  if (has('time') && t.timed > 0) {
    sentences.push(`About ${hoursText(t.hours)} of work, or ${daysText(t.hours)}${t.untimed > 0 ? `, with ${t.untimed} not estimated` : ''}.`);
  }
  if (done > 0 && open.length > 0) sentences.push(`Also ${plural(done, 'completed item')}.`);
  const parts = [header(settings, 'Completion List', title, sentences.join(' '))];
  if (settings.filters && settings.filters.length > 0) parts.push(`<p class="rb-filters">Filters: ${esc(settings.filters.join(', '))}.</p>`);

  const groups = groupLines(lines, design.groupBy);
  if (design.groupBy === 'location') {
    // Level by level, as the job lists them.
    const floors: { floor: string; groups: LineGroup[] }[] = [];
    for (const g of groups) {
      const floor = g.floor ?? '';
      const last = floors[floors.length - 1];
      if (last && last.floor === floor) last.groups.push(g);
      else floors.push({ floor, groups: [g] });
    }
    for (const f of floors) {
      if (f.floor) parts.push(`<h2 class="rb-section">${esc(f.floor)}</h2>`);
      parts.push(table(columns, f.groups.map(groupBody).join('')));
    }
  } else if (groups.length > 0) {
    parts.push(`<h2 class="rb-section">By ${esc(LIST_GROUP_LABELS[design.groupBy])}</h2>`);
    parts.push(table(columns, groups.map(groupBody).join('')));
  }

  return {
    title,
    kind: 'Completion List',
    fileName: `${safeName(`${settings.job.name} ${title}, ${printDate(settings.date).replace(',', '')}`)}.pdf`,
    body: parts.join(''),
  };
}

/** The whole job, for Ross Built: level by level, location by location, every detail on every line, photos included when given. */
export const WHOLE_JOB_DESIGN: ListDesign = {
  title: 'Whole Job',
  groupBy: 'location',
  details: ['description', 'company', 'trade', 'type', 'status', 'time', 'comments', 'photo'],
  daysLines: false,
  blankLines: true,
};

export function jobPrintout(lines: ListLine[], settings: PrintSettings): Printout {
  const page = customPrintout(lines, WHOLE_JOB_DESIGN, settings);
  return { ...page, fileName: `${safeName(`${settings.job.name} Completion List, ${printDate(settings.date).replace(',', '')}`)}.pdf` };
}

// ---------- the three week look ahead ----------

const LOOK_AHEAD_WEEKS = 3;

/** The look ahead starts this week, or next week once it is Friday: the day it goes out. */
export function lookAheadStart(today: string): string {
  const monday = mondayOf(today);
  return daysBetween(monday, today) >= 4 ? addDays(monday, 7) : monday;
}

/**
 * The schedule for everyone on the job, each week: every company's visits across the next three
 * weeks of working days, green once confirmed and blue for our best guess, then what each visit
 * covers with the location on every line, then what has no date yet.
 */
export function lookAheadPrintout(timeline: Timeline, lookups: ListLookups, settings: PrintSettings, today: string): Printout {
  const monday = lookAheadStart(today);
  const days = LOOK_AHEAD_WEEKS * 5;
  const lastDay = addDays(monday, (LOOK_AHEAD_WEEKS - 1) * 7 + 4);
  const company = (id: string) => lookups.companies.find((c) => c.id === id)?.name ?? 'Not set';
  const place = (id: string) => lookups.locations.find((l) => l.id === id)?.label ?? 'Not set';
  const inWindow = (b: TimelineBar) => !b.done && b.items.length > 0 && b.start <= lastDay && b.end >= monday;
  const rows = timelineRows(timeline, monday)
    .map((r) => ({ ...r, bars: r.bars.filter(inWindow) }))
    .filter((r) => r.bars.length > 0);
  const bars = rows.flatMap((r) => r.bars).sort((a, b) => a.start.localeCompare(b.start) || company(a.companyId).localeCompare(company(b.companyId)));
  const todayIndex = workingIndex(monday, today);

  const finish = timeline.finish ? `Everything with a date is done by ${dayText(timeline.finish, settings.date, true)}.` : '';
  const summary = [
    finish,
    bars.length > 0
      ? `${plural(bars.length, 'visit')} in the next three weeks. Green is confirmed; blue is our best guess. Tell us if your dates do not work, or if anything is missing.`
      : 'No visits in the next three weeks.',
  ]
    .filter(Boolean)
    .join(' ');
  const parts = [header(settings, 'Schedule', 'Three Week Look Ahead', summary)];

  // The chart: a row for each company, a column for each working day.
  const weekHeads = Array.from({ length: LOOK_AHEAD_WEEKS }, (_, w) => `<th colspan="5" class="rb-g-week">Week of ${esc(dayText(addDays(monday, w * 7), settings.date))}</th>`).join('');
  const dayHeads = Array.from({ length: days }, (_, i) => {
    const day = addDays(monday, Math.floor(i / 5) * 7 + (i % 5));
    return `<th class="rb-g-day${i % 5 === 0 ? ' rb-g-wk' : ''}${i === todayIndex ? ' rb-g-now' : ''}">${Number(day.slice(8))}</th>`;
  }).join('');
  const body = rows
    .map((r) => {
      const cells: string[] = [];
      for (let i = 0; i < days; ) {
        const bar = r.bars.find((b) => Math.max(0, workingIndex(monday, b.start)) === i);
        const wk = i % 5 === 0 ? ' rb-g-wk' : '';
        if (bar) {
          const span = Math.min(days - 1, workingIndex(monday, bar.end)) - i + 1;
          const kind = bar.kind === 'confirmed' ? ' rb-g-ok' : '';
          cells.push(`<td colspan="${span}" class="rb-g-cell${wk}"><div class="rb-g-bar${kind}${bar.pastDue ? ' rb-g-late' : ''}"></div></td>`);
          i += span;
        } else {
          cells.push(`<td class="rb-g-cell${wk}${i === todayIndex ? ' rb-g-now' : ''}"></td>`);
          i += 1;
        }
      }
      return `<tr><td class="rb-g-name">${esc(company(r.companyId))}</td>${cells.join('')}</tr>`;
    })
    .join('');
  if (rows.length > 0) {
    const cols = `<col style="width:1.35in">${'<col>'.repeat(days)}`;
    parts.push(
      `<table class="rb-gantt"><colgroup>${cols}</colgroup><thead><tr><th rowspan="2">Company</th>${weekHeads}</tr><tr>${dayHeads}</tr></thead><tbody>${body}</tbody></table>`,
    );
    parts.push('<p class="rb-key"><span><i class="rb-g-ok"></i>Confirmed</span><span><i></i>Our best guess</span></p>');

    // What each visit covers: the company, when, and the work, each piece with where it is.
    const columns = [
      { label: 'When', width: '1.75in' },
      { label: 'Company', width: '1.35in' },
      { label: 'Work' },
    ];
    const visitRows = bars
      .map((b, i) => {
        const when = b.days > 1 ? `${dayText(b.start, settings.date, true)} to ${dayText(b.end, settings.date, true)}` : dayText(b.start, settings.date, true);
        const status = b.pastDue ? 'Over, with work still open' : b.kind === 'confirmed' ? 'Confirmed' : 'Our best guess';
        const work = b.items.map((item) => `<div><b>${esc(item.title)}</b>, ${esc(place(item.locationId))}</div>`).join('');
        return `<tr class="rb-row${i % 2 === 1 ? ' rb-alt' : ''}"><td>${esc(when)}<div class="rb-meta">${esc(`${plural(b.days, 'day')}, ${status.toLowerCase()}`)}</div></td><td>${esc(company(b.companyId))}</td><td>${work}</td></tr>`;
      })
      .join('');
    parts.push('<h2 class="rb-section">What Each Visit Covers</h2>');
    parts.push(table(columns, visitRows));
  }

  if (timeline.noDate.length > 0) {
    const look = holdsFor(lookups);
    const columns = [{ label: 'Location', width: '1.35in' }, { label: 'Company', width: '1.35in' }, { label: 'Work' }];
    const undated = timeline.noDate
      .map(
        (item, i) =>
          `<tr class="rb-row${i % 2 === 1 ? ' rb-alt' : ''}"><td>${esc(place(item.locationId))}</td><td>${esc(item.companyId ? company(item.companyId) : 'Not set')}</td><td><div class="rb-work">${esc(item.title)}</div><div class="rb-note">${esc(`Waiting on ${holdText(item, look) || 'something not named'}`)}</div></td></tr>`,
      )
      .join('');
    parts.push('<h2 class="rb-section">No Date Yet</h2>');
    parts.push('<p class="rb-section-note">These go on the schedule once what they wait on has a date.</p>');
    parts.push(table(columns, undated));
  }
  if (timeline.needsPrice.length > 0) {
    parts.push(`<p class="rb-section-note">Also ${plural(timeline.needsPrice.length, 'item')} of additional work that ${timeline.needsPrice.length === 1 ? 'needs' : 'need'} a price before it is scheduled.</p>`);
  }

  return {
    title: 'Three Week Look Ahead',
    kind: 'Schedule',
    fileName: `${safeName(`${settings.job.name} Three Week Look Ahead, ${printDate(settings.date).replace(',', '')}`)}.pdf`,
    body: parts.join(''),
  };
}

const FONT = "'Nunito Sans', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** The house look, kept to the class rb-doc so the preview page can show it beside the app. */
export const PRINT_CSS = `
.rb-doc{font-family:${FONT};font-size:10pt;line-height:1.35;color:#3B5864;background:#FFFFFF;-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-text-size-adjust:none}
.rb-doc *{box-sizing:border-box}
.rb-head{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:9pt;border-bottom:0.75pt solid #CBD8DB}
.rb-brand-name{font-size:16pt;font-weight:700;letter-spacing:0.26em;line-height:1}
.rb-brand-sub{font-size:7pt;font-weight:600;letter-spacing:0.42em;color:#4E7A8C;margin-top:4pt}
.rb-head-right{text-align:right;font-size:9pt;color:#4E7A8C;line-height:1.3}
.rb-head-right b{display:block;font-size:10pt;font-weight:700;color:#3B5864}
.rb-title{font-size:20pt;font-weight:700;line-height:1.15;margin:18pt 0 2pt;letter-spacing:-0.01em}
.rb-job{font-size:10.5pt;color:#4E7A8C;margin:0}
.rb-summary{margin:8pt 0 0}
.rb-section{font-size:12pt;font-weight:700;margin:18pt 0 0;padding-bottom:4pt;border-bottom:1.25pt solid #5B8699;page-break-after:avoid;break-after:avoid}
.rb-section-note{font-size:9pt;color:#4E7A8C;margin:5pt 0 7pt}
.rb-section + .rb-table{margin-top:8pt}
.rb-table{width:100%;border-collapse:collapse;table-layout:fixed}
.rb-table thead{display:table-header-group}
.rb-table th{background:#3B5864;color:#FFFFFF;font-size:7.5pt;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:left;padding:5pt 6pt}
.rb-table td{padding:6pt;vertical-align:top;border-bottom:0.75pt solid #CBD8DB;background:#FFFFFF;overflow-wrap:break-word}
.rb-table tr{page-break-inside:avoid;break-inside:avoid}
.rb-table tr.rb-alt td{background:#F7F5EC}
.rb-table tr.rb-band td{background:#CBD8DB;font-weight:700;padding:4pt 6pt;page-break-after:avoid;break-after:avoid}
.rb-table tr.rb-blank td{height:26pt}
.rb-table tr.rb-days td{text-align:right;font-size:9pt;font-weight:600;color:#4E7A8C;padding:8pt 6pt 9pt}
.rb-fill{display:inline-block;width:0.9in;margin-left:6pt;border-bottom:0.75pt solid #5B8699;vertical-align:baseline}
.rb-num{font-weight:700;font-variant-numeric:tabular-nums}
.rb-new{display:inline-block;margin-top:3pt;padding:0 3pt;border:0.75pt solid #4E7A8C;border-radius:2pt;font-size:7pt;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#4E7A8C}
.rb-small{font-size:9pt}
.rb-late{font-weight:700}
.rb-work{font-weight:700}
.rb-desc{margin-top:1pt}
.rb-note{margin-top:2pt;font-size:9pt;color:#4E7A8C}
.rb-meta{margin-top:2pt;font-size:9pt;color:#4E7A8C}
.rb-quiet{color:#5B8699}
.rb-filters{margin:4pt 0 0;font-size:9pt;color:#4E7A8C}
.rb-comments{margin-top:4pt;padding-left:6pt;border-left:1.5pt solid #CBD8DB}
.rb-comment{font-size:8.5pt;line-height:1.3;margin-top:2pt;overflow-wrap:break-word}
.rb-comment b{font-weight:700}
.rb-section + .rb-comments{margin-top:8pt}
.rb-gantt{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:14pt}
.rb-gantt thead{display:table-header-group}
.rb-gantt th{background:#3B5864;color:#FFFFFF;font-size:7.5pt;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-align:left;padding:4pt 6pt;vertical-align:bottom}
.rb-gantt th.rb-g-week{border-left:0.75pt solid #5B8699}
.rb-gantt th.rb-g-day{background:#4E7A8C;text-align:center;padding:2pt 0;font-size:7pt;letter-spacing:0;font-variant-numeric:tabular-nums}
.rb-gantt th.rb-g-now{background:#3B5864}
.rb-gantt td{border-bottom:0.75pt solid #CBD8DB;padding:3pt 1pt;height:19pt;vertical-align:middle}
.rb-gantt tr{page-break-inside:avoid;break-inside:avoid}
.rb-gantt td.rb-g-name{font-weight:700;font-size:8.5pt;line-height:1.2;padding:3pt 6pt 3pt 0;overflow-wrap:break-word}
.rb-gantt .rb-g-wk{border-left:0.75pt solid #CBD8DB}
.rb-gantt td.rb-g-now{background:#F7F5EC}
.rb-g-bar{height:11pt;border-radius:2pt;background:#4E7A8C}
.rb-g-bar.rb-g-ok,.rb-key i.rb-g-ok{background:#4E7F5E}
.rb-g-bar.rb-g-late{border:1.25pt solid #B42318}
.rb-key{display:flex;gap:16pt;margin:6pt 0 0;font-size:8.5pt;color:#4E7A8C}
.rb-key i{display:inline-block;width:14pt;height:8pt;border-radius:2pt;margin-right:5pt;vertical-align:-1pt;background:#4E7A8C}
.rb-ph{position:relative;width:${PHOTO_WIDTH}in;overflow:hidden;border-radius:3pt;background:#F7F5EC}
.rb-ph img{display:block;width:100%;height:100%;object-fit:cover}
.rb-ph svg{position:absolute;left:0;top:0;width:100%;height:100%;font-family:${FONT}}
`;

/**
 * A printout as a whole page. fontCss carries the house font when the page cannot load it by name;
 * pageMargins is off on the iPhone, where the margins are set when the PDF is made instead.
 */
export function printPage(printout: Printout, options: { fontCss?: string; pageMargins?: boolean } = {}): string {
  const page = options.pageMargins === false ? '@page{size:letter;margin:0}' : '@page{size:letter;margin:0.75in}';
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    `<title>${esc(printout.title)}</title>`,
    `<style>${options.fontCss ?? ''}${PRINT_CSS}${page}html,body{margin:0;padding:0;background:#FFFFFF}</style>`,
    `</head><body><div class="rb-doc">${printout.body}</div></body></html>`,
  ].join('');
}

/** The footer on every page: the job and list on the left, the page on the right. */
export function footerText(printout: Printout, settings: Pick<PrintSettings, 'job' | 'date'>): string {
  return `${settings.job.name}, ${printout.kind}, ${printout.title}, ${printDate(settings.date)}`;
}
