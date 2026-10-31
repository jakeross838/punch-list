// Filling in an item from its photo. Claude is told the room, the job's standard titles (with how
// long each usually takes), the companies on the job and what the marks point at, and asked for the
// item the way Ross Built writes them, with about how long it takes. Its answer only fills in the
// form; the person checks it before it is kept.

import { TITLE_MAX } from './rules';
import { hoursText, tidyHours } from './time';
import { tidyTitle } from './titles';
import type { Company, Item, JobCompany, Mark, MarkColor, StandardTitle, Trade } from './types';

export interface SuggestContext {
  room: string;
  /** The standard titles with their trade and usual time, most used first. */
  titles: { title: string; trade: string | null; hours: number | null }[];
  /** The companies on the job and the trade each does here. */
  companies: { name: string; trade: string }[];
  trades: string[];
  marks: Mark[];
}

export interface ItemSuggestion {
  title: string;
  description: string;
  /** A trade from the list, or null. */
  trade: string | null;
  /** A company on the job, or null. */
  company: string | null;
  /** About how long it takes, in hours, or null. */
  hours: number | null;
}

const COLOR: Record<MarkColor, string> = { red: 'red', yellow: 'yellow', white: 'white', black: 'black' };
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The marks in words, so Claude knows where to look. */
export function describeMarks(marks: Mark[]): string[] {
  return marks.flatMap((m) => {
    switch (m.tool) {
      case 'circle':
      case 'box': {
        const [x1, y1] = m.from;
        const [x2, y2] = m.to;
        const shape = m.tool === 'circle' ? 'circle' : 'box';
        return [`A ${COLOR[m.color]} ${shape} around the area from ${pct(Math.min(x1, x2))} to ${pct(Math.max(x1, x2))} across and ${pct(Math.min(y1, y2))} to ${pct(Math.max(y1, y2))} down.`];
      }
      case 'arrow':
        return [`A ${COLOR[m.color]} arrow pointing at the spot ${pct(m.to[0])} across and ${pct(m.to[1])} down.`];
      case 'pen': {
        const xs = m.points.map((p) => p[0]);
        const ys = m.points.map((p) => p[1]);
        return [`A ${COLOR[m.color]} line drawn over the area from ${pct(Math.min(...xs))} to ${pct(Math.max(...xs))} across and ${pct(Math.min(...ys))} to ${pct(Math.max(...ys))} down.`];
      }
      case 'measure': {
        const size = m.text.trim();
        return [
          `A ${COLOR[m.color]} measurement from ${pct(m.from[0])} across and ${pct(m.from[1])} down to ${pct(m.to[0])} across and ${pct(m.to[1])} down${size ? `, marked "${size}"` : ''}.`,
        ];
      }
      case 'number':
        return [`Spot ${m.n}, a ${COLOR[m.color]} numbered dot at ${pct(m.at[0])} across and ${pct(m.at[1])} down.`];
      case 'text':
        return [`A note reading "${m.text}" at ${pct(m.at[0])} across and ${pct(m.at[1])} down.`];
      default:
        return [];
    }
  });
}

const COUNT_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

export function suggestPrompt(ctx: SuggestContext): string {
  const marks = describeMarks(ctx.marks);
  const spots = ctx.marks.filter((m) => m.tool === 'number').length;
  const sized = ctx.marks.some((m) => m.tool === 'measure' && m.text.trim() !== '');
  return [
    'You are filling in one item on the running list of work that still needs to be done on a Ross Built Custom Homes job site, from one photo.',
    `The photo was taken in ${ctx.room}.`,
    marks.length > 0
      ? `The superintendent marked the photo to show the problem:\n${marks.map((m) => `- ${m}`).join('\n')}`
      : 'The photo has no marks. Find the most likely unfinished work or problem in it.',
    '',
    'Write the item the way Ross Built writes them:',
    '- title: a verb and the thing, as short as possible, like "Install toilet" or "Touch up paint". No room, no trade, no sizes, no brands. When one of the standard titles below fits, use it word for word.',
    '- description: where exactly and what is involved, in one short sentence with proper capitalization, or an empty string when the title says it all. Do not name the room.',
    ...(spots > 1
      ? [`- The ${spots} numbered spots are places with the same work: the description says so, like "${COUNT_WORDS[spots] ?? spots} spots, numbered on the photo."`]
      : []),
    ...(sized ? ['- A size marked on the photo goes in the description as it is written, like "24 inches left of the vanity."'] : []),
    '- trade: one of the trades below, or null when unsure.',
    '- company: the company on this job for that trade, from the list below, or null when unsure.',
    '- hours: about how long the work takes the company once it is on site, in hours, counting setup and cleanup: 0.25 for 15 minutes, 0.5 for 30 minutes, 8 for a full working day. When the standard title you use lists a usual time, use that time. Null when you cannot tell.',
    '',
    'Standard titles (title, trade, usual time):',
    ...ctx.titles.slice(0, 150).map((t) => `- ${t.title}${t.trade || t.hours ? ` (${[t.trade, t.hours ? `usually ${hoursText(t.hours)}` : null].filter(Boolean).join(', ')})` : ''}`),
    '',
    `Trades: ${ctx.trades.join(', ')}`,
    '',
    'Companies on this job (company, trade):',
    ...ctx.companies.map((c) => `- ${c.name} (${c.trade})`),
    '',
    'Reply with only JSON, like {"title": "Touch up paint", "description": "Ceiling at the hood soffit.", "trade": "Painting", "company": "Triple H Painting", "hours": 0.5}.',
  ].join('\n');
}

const find = (list: string[], name: unknown) =>
  typeof name === 'string' ? list.find((x) => x.trim().toLowerCase() === name.trim().toLowerCase()) ?? null : null;

/** Claude's answer, checked: a real title, and a trade and company only when they are on the job. */
export function readSuggestion(raw: unknown, ctx: SuggestContext): ItemSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || r.title.trim() === '') return null;
  const standard = ctx.titles.find((t) => t.title.toLowerCase() === tidyTitle(r.title as string).toLowerCase());
  const title = (standard?.title ?? tidyTitle(r.title)).slice(0, TITLE_MAX);
  const description = typeof r.description === 'string' ? r.description.trim().replace(/\s+/g, ' ') : '';
  let company = find(
    ctx.companies.map((c) => c.name),
    r.company,
  );
  let trade = find(ctx.trades, r.trade) ?? standard?.trade ?? null;
  if (company && !trade) trade = ctx.companies.find((c) => c.name === company)?.trade ?? null;
  if (trade && !company) {
    const doing = ctx.companies.filter((c) => c.trade === trade);
    if (doing.length === 1) company = doing[0]!.name;
  }
  if (company && trade && !ctx.companies.some((c) => c.name === company && c.trade === trade)) {
    // A company that does a different trade on this job: keep the company and its own trade.
    trade = ctx.companies.find((c) => c.name === company)?.trade ?? trade;
  }
  const hours = standard?.hours ?? tidyHours(r.hours);
  return { title, description, trade, company, hours };
}

/** What Claude is told about the job for one photo: the location, the standard titles, the companies on the job and the marks. */
export function suggestContext(input: {
  location: string | null;
  titles: StandardTitle[];
  trades: Trade[];
  companies: Company[];
  jobCompanies: JobCompany[];
  marks: Mark[];
}): SuggestContext {
  const tradeName = (id: string | null) => input.trades.find((t) => t.id === id)?.name ?? null;
  return {
    room: input.location ?? 'the job',
    titles: [...input.titles]
      .filter((t) => t.approved)
      .sort((a, b) => b.uses - a.uses)
      .map((t) => ({ title: t.title, trade: tradeName(t.tradeId), hours: t.hours })),
    companies: input.jobCompanies
      .map((jc) => ({ name: input.companies.find((c) => c.id === jc.companyId)?.name ?? '', trade: tradeName(jc.tradeId) ?? '' }))
      .filter((c) => c.name && c.trade),
    trades: input.trades.map((t) => t.name),
    marks: input.marks,
  };
}

type Fillable = Pick<Item, 'title' | 'description' | 'companyId' | 'tradeId' | 'hours'>;

/** What a suggestion fills in: only what is still blank, never what was typed. Empty when there is nothing to fill. */
export function suggestionPatch(s: ItemSuggestion, value: Fillable, trades: Trade[], companies: Company[]): Partial<Fillable> {
  const tradeId = trades.find((t) => t.name === s.trade)?.id ?? null;
  const companyId = companies.find((c) => c.name === s.company)?.id ?? null;
  const patch: Partial<Fillable> = {};
  if (!value.title.trim()) patch.title = s.title;
  if (!value.description.trim() && s.description) patch.description = s.description;
  if (!value.companyId && !value.tradeId && companyId && tradeId) {
    patch.companyId = companyId;
    patch.tradeId = tradeId;
  } else if (!value.tradeId && tradeId) patch.tradeId = tradeId;
  if (value.hours === null && s.hours !== null) patch.hours = s.hours;
  return patch;
}
