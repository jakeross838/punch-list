// The job's station, from the job's own link: a tablet or a TV in the house.
//
// On a tablet (/s), every company with work on the job, the most ready first, each with how much of
// its work is ready, waiting and done to check, and what to do next. A company taps its name for its
// own list (list.ts), in the order to do it, and answers there: Confirm, how long it takes, Mark
// Done and comments. The name typed is kept on the station for that company. After a few minutes
// with no one touching it, the station goes back to every company, for whoever comes next.
//
// On a TV (/tv), the same board in large type, a page at a time when there are more companies than
// fit, with a code to open the station on a phone. No one touches it: it keeps itself up to date.
//
// Built by tools/build-company-page.mjs; it talks only to the company-page function, with the
// station's link, never a company's.

import { doFirst, FREES_NOTHING } from '@punch/core';
import qrcode from 'qrcode-generator';
import { mountList, type ListView } from './list';
import { clockText, dayText, esc, isQuoted, plural, problemHtml, todayText } from './shared';
import { answerStation, sampleBoard, sampleStation } from './stationSample';
import type { Page, StationBoard, StationCompany, StationItem } from './types';

declare const FUNCTION_URL: string;

const app = document.getElementById('app')!;
const TV = /\/tv\/?$/.test(location.pathname);
const token = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim().toLowerCase();
/** The sample station: made up work, answered here and sent nowhere. */
const SAMPLE = token === 'sample';
const sample = SAMPLE ? sampleStation() : null;

/** How long the station waits, untouched, before going back to every company. */
const IDLE_MS = 3 * 60_000;
/** How often it asks again. */
const REFRESH_MS = 60_000;
/** On the TV: how long each page of companies stays up, and how many fit on one. */
const TV_PAGE_MS = 15_000;
const TV_PER_PAGE = 6;

// ---------- talking to the function ----------

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ s: token, ...body }),
  });
  const data = (await res.json().catch(() => ({ error: 'Something went wrong. Try again in a moment.' }))) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? 'Something went wrong. Try again in a moment.');
  return data;
}

const getBoard = async (): Promise<StationBoard> => (sample ? (JSON.parse(JSON.stringify(sampleBoard(sample))) as StationBoard) : post<StationBoard>({}));
const callCompany =
  (companyId: string) =>
  async (body: Record<string, unknown>): Promise<Page> =>
    sample ? answerStation(sample, companyId, body) : post<Page>({ company: companyId, ...body });

// ---------- each company's work ----------

const facts = (i: StationItem) => ({ ready: i.ready, priority: i.priority, readyBy: i.ready_by, freed: i.holds_up ?? FREES_NOTHING });

interface Work {
  company: StationCompany;
  /** Ready and priced, in the order to do it: the same numbers as on the company's own list. */
  ready: StationItem[];
  waiting: StationItem[];
  quoted: number;
  /** Marked done by the company, for the builder to check. */
  check: number;
  open: number;
  /** The soonest Ready By of what is waiting. */
  soonest: string | null;
}

function workOf(company: StationCompany): Work {
  const working = company.items.filter((i) => !i.marked_done_at);
  const ready = working.filter((i) => i.ready && !isQuoted(i)).sort((a, b) => doFirst(facts(a), facts(b)));
  const waiting = working.filter((i) => !i.ready && !isQuoted(i));
  const soonest = waiting
    .map((i) => i.ready_by)
    .filter((d): d is string => !!d)
    .sort()[0];
  return { company, ready, waiting, quoted: working.filter(isQuoted).length, check: company.items.length - working.length, open: company.items.length, soonest: soonest ?? null };
}

/** The most ready work first, then the most open, then by name. */
const mostReady = (a: Work, b: Work) => b.ready.length - a.ready.length || b.open - a.open || a.company.name.localeCompare(b.company.name);

function countsLine(w: Work): string {
  return [
    w.ready.length > 0 ? `${w.ready.length} ready` : null,
    w.waiting.length > 0 ? `${w.waiting.length} waiting` : null,
    w.quoted > 0 ? `${w.quoted} to be quoted` : null,
    w.check > 0 ? `${w.check} to check` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function nextLine(w: Work): string {
  const first = w.ready[0];
  if (first) return `Next: ${first.title}, ${first.location}`;
  if (w.waiting.length > 0) return w.soonest ? `Nothing ready yet. Ready by ${dayText(w.soonest)}.` : 'Nothing ready yet.';
  return w.check > 0 ? 'Done: waiting to be checked.' : '';
}

/** The station's own link, for the code on the TV: open it on a phone. */
const stationUrl = () => `${location.origin}/s#${SAMPLE ? 'sample' : token}`;

function codeSvg(url: string): string {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const runs: string[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; ) {
        if (!qr.isDark(y, x)) {
          x += 1;
          continue;
        }
        let end = x;
        while (end < n && qr.isDark(y, end)) end += 1;
        runs.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
        x = end;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="Scan to open the station"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#FFFFFF"/><path fill="#132028" d="${runs.join('')}"/></svg>`;
  } catch {
    return '';
  }
}

// ---------- the tablet ----------

let board: StationBoard | null = null;
let list: ListView | null = null;
let showing: string | null = null;
let idleTimer = 0;

function boardHtml(b: StationBoard): string {
  const work = b.companies.map(workOf);
  const busy = work.filter((w) => w.open > 0).sort(mostReady);
  const clear = work.filter((w) => w.open === 0).map((w) => w.company.name);
  const ready = busy.reduce((n, w) => n + w.ready.length, 0);
  const check = busy.reduce((n, w) => n + w.check, 0);
  const counts = [plural(busy.length, 'company', 'companies'), `${ready} ready now`, check > 0 ? `${check} to check` : null].filter(Boolean).join(' · ');
  const tiles = busy
    .map(
      (w) => `<button class="tile${w.ready.length > 0 ? '' : ' wait'}" data-company="${esc(w.company.id)}">
        <span class="tile-name">${esc(w.company.name)}</span>
        ${w.company.trade ? `<span class="tile-trade">${esc(w.company.trade)}</span>` : ''}
        <span class="tile-counts">${esc(countsLine(w))}</span>
        <span class="tile-next">${esc(nextLine(w))}</span>
      </button>`,
    )
    .join('');
  return `<div class="bar"><span class="brand">${esc(b.builder.toUpperCase())}</span><span class="sub">JOB STATION</span></div>
  <main class="wrap station">
    <header class="head">
      <div class="eyebrow">Job Station</div>
      <h1>${esc(b.job.name)}</h1>
      ${b.job.address ? `<p class="address">${esc(b.job.address)}</p>` : ''}
      <p class="counts">${esc(counts)}</p>
      ${b.job.closed ? '<p class="closed">This job is closed. Nothing more is needed here.</p>' : ''}
    </header>
    ${
      busy.length > 0
        ? `<div class="section"><h2>Tap your company</h2><span>${busy.length}</span></div><div class="tiles">${tiles}</div>`
        : '<div class="card empty"><h2>Nothing open</h2><p>Every company&apos;s work here is done. Thank you.</p></div>'
    }
    ${clear.length > 0 ? `<p class="alldone">Nothing open for ${esc(clear.join(', '))}.</p>` : ''}
    <footer>${
      SAMPLE
        ? 'This is a sample: nothing here is real, and nothing you do on it is sent anywhere.'
        : `This station is for everyone working on ${esc(b.job.name)}. Anyone with its link sees these lists and can answer for any company on them, so ${esc(b.builder)} checks the work before taking it off.`
    }</footer>
  </main>`;
}

async function loadBoard(): Promise<void> {
  try {
    board = await getBoard();
    if (showing) return;
    document.title = `${board.job.name}, Job Station`;
    app.innerHTML = boardHtml(board);
  } catch (e) {
    if (!board || !showing) app.innerHTML = problemHtml('The station did not open', e instanceof Error ? e.message : 'Try again in a moment.');
  }
}

function open(companyId: string): void {
  const company = board?.companies.find((c) => c.id === companyId);
  if (!company || !board) return;
  const builder = board.builder;
  showing = companyId;
  list?.destroy();
  window.scrollTo(0, 0);
  app.innerHTML = '<div class="bar"><span class="brand">JOB STATION</span></div><main class="wrap"><p class="loading">Getting the list</p></main>';
  list = mountList({
    root: app,
    call: callCompany(companyId),
    nameKey: `punch-station-name-${companyId}`,
    bar: () => `<div class="bar"><button class="back" data-back aria-label="Back to every company">‹ All Companies</button><span class="sub">${esc(builder.toUpperCase())} · JOB STATION</span></div>`,
    footer: (p) =>
      SAMPLE
        ? 'This is a sample: nothing here is real, and nothing you do on it is sent anywhere.'
        : `${esc(p.company.name)}'s list on the job's station. The name above is kept here for the next time someone from ${esc(p.company.name)} answers.`,
    onProblem: (message) => {
      app.innerHTML = `<div class="bar"><button class="back" data-back>‹ All Companies</button></div><main class="wrap"><div class="problem"><h1>This list did not open</h1><p>${esc(message)}</p></div></main>`;
    },
  });
  void list.load();
  touched();
}

function back(): void {
  list?.destroy();
  list = null;
  showing = null;
  window.clearTimeout(idleTimer);
  window.scrollTo(0, 0);
  if (board) app.innerHTML = boardHtml(board);
  void loadBoard();
}

/** Someone touched the station: it waits again before going back to every company. */
function touched(): void {
  window.clearTimeout(idleTimer);
  if (showing) idleTimer = window.setTimeout(back, IDLE_MS);
}

function startTablet(): void {
  app.innerHTML = '<div class="bar"><span class="brand">JOB STATION</span></div><main class="wrap"><p class="loading">Getting the lists</p></main>';
  app.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el) return;
    if (el.dataset.back !== undefined) return back();
    if (el.dataset.company) open(el.dataset.company);
  });
  for (const kind of ['pointerdown', 'keydown', 'scroll']) document.addEventListener(kind, touched, { passive: true });
  void loadBoard();
  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!showing) void loadBoard();
    else if (list && !list.waiting()) void list.load();
  }, REFRESH_MS);
}

// ---------- the TV ----------

let tvPage = 0;
let tvAt = new Date();

function tvCard(w: Work): string {
  const next = w.ready.slice(0, 3);
  return `<section class="tv-card${w.ready.length > 0 ? '' : ' wait'}">
    <div class="tv-name">${esc(w.company.name)}</div>
    ${w.company.trade ? `<div class="tv-trade">${esc(w.company.trade)}</div>` : '<div class="tv-trade">&nbsp;</div>'}
    <div class="tv-stats">
      <div class="${w.ready.length > 0 ? 'go' : ''}"><b>${w.ready.length}</b><span>Ready</span></div>
      <div><b>${w.waiting.length}</b><span>Waiting</span></div>
      <div><b>${w.check}</b><span>To Check</span></div>
    </div>
    ${
      next.length > 0
        ? `<ol class="tv-next">${next.map((i, k) => `<li><span class="tv-step">${k + 1}</span><span class="tv-what">${esc(i.title)} <em>${esc(i.location)}</em></span></li>`).join('')}</ol>`
        : `<p class="tv-none">${esc(nextLine(w) || 'Nothing open.')}</p>`
    }
  </section>`;
}

function renderTv(): void {
  if (!board) return;
  const work = board.companies
    .map(workOf)
    .filter((w) => w.open > 0)
    .sort(mostReady);
  const pages = Math.max(1, Math.ceil(work.length / TV_PER_PAGE));
  tvPage %= pages;
  const shown = work.slice(tvPage * TV_PER_PAGE, (tvPage + 1) * TV_PER_PAGE);
  const ready = work.reduce((n, w) => n + w.ready.length, 0);
  const now = new Date();
  app.innerHTML = `<div class="tv-top">
      <div><div class="tv-brand">${esc(board.builder.toUpperCase())} · JOB STATION</div><div class="tv-job">${esc(board.job.name)}</div></div>
      <div class="tv-when"><div>${esc(todayText(now))}</div><div class="tv-clock">${esc(clockText(now))}</div></div>
    </div>
    ${
      board.job.closed
        ? '<div class="tv-empty">This job is closed. Nothing more is needed here.</div>'
        : work.length === 0
          ? '<div class="tv-empty">Every company&apos;s work here is done. Thank you.</div>'
          : `<div class="tv-grid">${shown.map(tvCard).join('')}</div>`
    }
    <div class="tv-foot">
      <div class="tv-code">${codeSvg(stationUrl())}</div>
      <div class="tv-say"><b>${esc(`${ready} ready now`)}.</b> Scan the code to open the station on your phone, then tap your company to see your list and mark work done.</div>
      <div class="tv-page">${pages > 1 ? `Page ${tvPage + 1} of ${pages} · ` : ''}Updated ${esc(clockText(tvAt))}</div>
    </div>`;
}

async function loadTv(): Promise<void> {
  try {
    board = await getBoard();
    tvAt = new Date();
    document.title = `${board.job.name}, Job Station`;
    renderTv();
  } catch (e) {
    board = null;
    app.innerHTML = `<div class="tv-empty tv-problem">${esc(e instanceof Error ? e.message : 'The station did not open. Trying again in a minute.')}</div>`;
  }
}

function startTv(): void {
  document.body.classList.add('tv');
  app.innerHTML = '<div class="tv-empty">Getting the lists</div>';
  void loadTv();
  window.setInterval(() => void loadTv(), REFRESH_MS);
  // The next page of companies, and the clock.
  window.setInterval(() => {
    tvPage += 1;
    renderTv();
  }, TV_PAGE_MS);
}

// ---------- start ----------

// Another link opened in the same tab: start over with it.
window.addEventListener('hashchange', () => location.reload());

if (!SAMPLE && !/^[0-9a-f]{64}$/.test(token)) {
  app.innerHTML = problemHtml('The station did not open', 'The link is not complete. Open it again from the app: the job menu, Job Station.');
} else if (TV) {
  startTv();
} else {
  startTablet();
}
