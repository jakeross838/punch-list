// The lists as printed pages, to the house document standard: US Letter, Nunito Sans at 10 point,
// the five house colors, and tables that carry the content (dark slate header rows, light blue
// group bands, white and cream rows). A company's list says what is ready now, then what is
// waiting, grouped by what it waits on, with a Days column for the sub to fill in and blank lines
// to add anything missing. The whole job list goes room by room with the trade on every line.
// Plain HTML, so the phone turns it into a PDF and the preview page shows the very same thing.

import type { CompanyList, ListLine } from './lists';
import { markShapes, type MarkShape } from './marks';
import type { Mark } from './types';
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
}

export interface Printout {
  /** What the list is, for the preview and the share sheet: "SMS Carpentry". */
  title: string;
  /** The PDF's name: "Fish Completion List for SMS Carpentry, October 30 2026.pdf". */
  fileName: string;
  /** The page's content, laid out by PRINT_CSS inside an element with the class rb-doc. */
  body: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 30, 2026" */
export function printDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** A Ready By date as it reads on a list: "November 2", with the year only when it is not this one. */
function readyByText(ymd: string, today: Date): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${MONTHS[m - 1]} ${d}${y === today.getFullYear() ? '' : `, ${y}`}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
      return `<path d="${s.d}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'ellipse':
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="none"/>`;
    case 'rect':
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="none" stroke-linejoin="round"/>`;
    case 'text':
      return `<text x="${s.x}" y="${s.y}" fill="${s.fill}" font-size="${s.fontSize}" font-weight="700">${esc(s.text)}</text>`;
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

/** The title, then where exactly, then for added scope whether it is priced. */
function workCell(line: ListLine): string {
  const { item } = line;
  const parts = [`<div class="rb-work">${esc(item.title)}</div>`];
  if (item.description) parts.push(`<div class="rb-desc">${esc(item.description)}</div>`);
  if (item.kind === 'added_scope') {
    const note = item.poOrCo ? `Added scope, ${item.poOrCo}` : item.boughtOut ? 'Added scope' : 'Added scope, not priced yet';
    parts.push(`<div class="rb-note">${esc(note)}</div>`);
  }
  return parts.join('');
}

function readyCell(line: ListLine, today: Date): string {
  const { item } = line;
  if (item.ready) return 'Ready';
  const on = waitingOnText(item.waitingOn) || 'something not named';
  return esc(`Waiting on ${on}${item.readyBy ? `, ready by ${readyByText(item.readyBy, today)}` : ''}`);
}

function header(settings: PrintSettings, title: string, summary: string): string {
  const { job, date } = settings;
  return [
    '<div class="rb-head">',
    '<div class="rb-brand"><div class="rb-brand-name">ROSS BUILT</div><div class="rb-brand-sub">CUSTOM HOMES</div></div>',
    `<div class="rb-head-right"><b>Completion List</b>${esc(printDate(date))}</div>`,
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

function table(columns: Column[], body: string): string {
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

const band = (columns: Column[], text: string) => `<tr class="rb-band"><td colspan="${columns.length}">${esc(text)}</td></tr>`;
const blanks = (columns: Column[], count: number) =>
  Array.from({ length: count }, () => `<tr class="rb-blank">${columns.map(() => '<td></td>').join('')}</tr>`).join('');

/** One company's list, for the sub: Ready Now, then Waiting by what it waits on, then lines to add more. */
export function companyPrintout(list: CompanyList, settings: PrintSettings): Printout {
  const withPhotos = !!settings.photo;
  const columns: Column[] = [
    { label: 'Item', width: '0.5in', cell: (l) => esc(itemNumberLabel(l.item)), className: 'rb-num' },
    { label: 'Room', width: '1.3in', cell: (l) => esc(l.room) },
    { label: 'Work', cell: workCell },
    ...(withPhotos ? [{ label: 'Photo', width: `${PHOTO_WIDTH + 0.16}in`, cell: (l: ListLine) => photoCell(settings.photo?.(l.item.id)) }] : []),
    { label: 'Days', width: '0.6in', cell: () => '' },
  ];
  const waitingCount = list.waiting.reduce((n, g) => n + g.lines.length, 0);
  const counts =
    list.open === 0
      ? 'Nothing open right now.'
      : waitingCount === 0
        ? `${plural(list.open, 'open item')}, all ready now.`
        : list.ready.length === 0
          ? `${plural(list.open, 'open item')}, all waiting on something first.`
          : `${plural(list.open, 'open item')}: ${list.ready.length} ready now and ${waitingCount} waiting.`;
  const trades = list.trades.length > 0 ? `${waitingOnText(list.trades)}. ` : '';
  const parts = [header(settings, list.company, `${trades}${counts}`)];

  parts.push('<h2 class="rb-section">Ready Now</h2>');
  if (list.ready.length > 0) {
    parts.push('<p class="rb-section-note">These can be done any time.</p>');
    parts.push(table(columns, rows(columns, list.ready)));
  } else {
    parts.push('<p class="rb-section-note">Nothing is ready yet.</p>');
  }

  if (list.waiting.length > 0) {
    parts.push('<h2 class="rb-section">Waiting</h2>');
    parts.push('<p class="rb-section-note">Grouped by what each is waiting on, soonest first.</p>');
    const body = list.waiting
      .map((g) => band(columns, `Waiting on ${g.on}${g.readyBy ? `, ready by ${readyByText(g.readyBy, settings.date)}` : ''}`) + rows(columns, g.lines))
      .join('');
    parts.push(table(columns, body));
  }

  const added = columns.filter((c) => c.label !== 'Photo');
  parts.push('<h2 class="rb-section">Anything Missing</h2>');
  parts.push('<p class="rb-section-note">Add anything not on this list.</p>');
  parts.push(table(added, blanks(added, 6)));

  const title = list.company;
  return {
    title,
    fileName: `${safeName(`${settings.job.name} Completion List for ${list.company}, ${printDate(settings.date).replace(',', '')}`)}.pdf`,
    body: parts.join(''),
  };
}

/** The whole job, for Ross Built: floor by floor, room by room, the trade and company on every line. */
export function jobPrintout(lines: ListLine[], settings: PrintSettings): Printout {
  const withPhotos = !!settings.photo;
  const columns: Column[] = [
    { label: 'Item', width: '0.5in', cell: (l) => esc(itemNumberLabel(l.item)), className: 'rb-num' },
    { label: 'Work', cell: workCell },
    { label: 'Trade', width: '1.05in', cell: (l) => esc(l.trade), className: 'rb-small' },
    { label: 'Company', width: '1.1in', cell: (l) => esc(l.company), className: 'rb-small' },
    { label: 'Ready', width: '1.3in', cell: (l) => readyCell(l, settings.date), className: 'rb-small' },
    ...(withPhotos ? [{ label: 'Photo', width: `${PHOTO_WIDTH + 0.16}in`, cell: (l: ListLine) => photoCell(settings.photo?.(l.item.id)) }] : []),
  ];
  const ready = lines.filter((l) => l.item.ready).length;
  const rooms = new Set(lines.map((l) => l.item.locationId)).size;
  const summary =
    lines.length === 0
      ? 'Nothing open right now.'
      : `${plural(lines.length, 'open item')} in ${plural(rooms, 'room')}: ${ready} ready now and ${lines.length - ready} waiting.`;
  const parts = [header(settings, 'Whole Job', summary)];

  // Floors in the order they come, each with its rooms in order and a blank line in each room.
  const floors: { floor: string; rooms: { room: string; lines: ListLine[] }[] }[] = [];
  for (const line of lines) {
    let floor = floors[floors.length - 1];
    if (!floor || floor.floor !== line.floor) {
      floor = floors.find((f) => f.floor === line.floor) ?? { floor: line.floor, rooms: [] };
      if (!floors.includes(floor)) floors.push(floor);
    }
    let room = floor.rooms.find((r) => r.room === line.room);
    if (!room) {
      room = { room: line.room, lines: [] };
      floor.rooms.push(room);
    }
    room.lines.push(line);
  }
  for (const floor of floors) {
    parts.push(`<h2 class="rb-section">${esc(floor.floor)}</h2>`);
    parts.push(table(columns, floor.rooms.map((r) => band(columns, r.room) + rows(columns, r.lines) + blanks(columns, 1)).join('')));
  }

  return {
    title: 'Whole Job',
    fileName: `${safeName(`${settings.job.name} Completion List, ${printDate(settings.date).replace(',', '')}`)}.pdf`,
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
.rb-num{font-weight:700;font-variant-numeric:tabular-nums}
.rb-small{font-size:9pt}
.rb-work{font-weight:700}
.rb-desc{margin-top:1pt}
.rb-note{margin-top:2pt;font-size:9pt;color:#4E7A8C}
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
