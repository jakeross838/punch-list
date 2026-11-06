// The company's page: what a company sees from the private link on the list it was sent, with no
// account and no app. Its open items on the job with their marked up photos, ready now or what each
// waits on and when it should be ready, then what was checked off lately. On each item it confirms
// the item, says how long it takes, marks it done for the builder to check, and comments, under the
// name typed once at the top. It asks again every minute it is open, so the list stays live.
//
// Built into one page by tools/build-company-page.mjs; it talks only to the company-page function.

import { hoursText, KIND_LABELS, marksSvg, PICK_HOURS, QUICK_HOURS } from '@punch/core';
import { answerSample, samplePage } from './sample';
import type { Page, PageComment, PageItem, PagePhoto } from './types';

declare const FUNCTION_URL: string;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const app = document.getElementById('app')!;
const token = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim().toLowerCase();
/** The sample page: made up work, answered here and sent nowhere. */
const SAMPLE = token === 'sample';
let sample = SAMPLE ? samplePage() : null;

let page: Page | null = null;
let name = remembered('punch-name') ?? '';
/** What is being sent, by item ("list" for the whole list), so its buttons wait. */
const busy = new Set<string>();
/** Comments being written, kept through every refresh. */
const drafts = new Map<string, string>();
/** Items whose Other time list is open. */
const choosingTime = new Set<string>();

// ---------- small helpers ----------

function esc(text: string | null | undefined): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Browser storage can be missing or refuse: the page works without it. */
function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing kept between visits; the name is asked again next time.
  }
}

/** "Friday, November 13", with the year when it is not this one. */
function dayText(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}${y === new Date().getFullYear() ? '' : `, ${y}`}`;
}

/** "Today", "Yesterday" or "November 4", for when something was said or done. */
function whenText(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (day(at) === day(today)) return 'Today';
  if (day(at) === day(yesterday)) return 'Yesterday';
  return `${MONTHS[at.getMonth()]} ${at.getDate()}${at.getFullYear() === today.getFullYear() ? '' : `, ${at.getFullYear()}`}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function andList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function isQuoted(item: PageItem): boolean {
  return item.kind === 'added_scope' && !(item.po_or_co ?? '').trim();
}

// ---------- talking to the function ----------

async function call(body: Record<string, unknown>): Promise<Page> {
  if (sample) {
    sample = answerSample(sample, body);
    return JSON.parse(JSON.stringify(sample)) as Page;
  }
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: token, ...body }),
  });
  const data = (await res.json().catch(() => ({ error: 'Something went wrong. Try again in a moment.' }))) as Page & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? 'Something went wrong. Try again in a moment.');
  return data;
}

async function load(): Promise<void> {
  try {
    page = await call({ action: 'page' });
    document.title = `${page.company.name}, ${page.job.name}`;
    render();
  } catch (e) {
    if (!page) showProblem(e instanceof Error ? e.message : 'This page did not open. Try again in a moment.');
  }
}

async function send(key: string, body: Record<string, unknown>, after?: () => void): Promise<void> {
  if (busy.has(key)) return;
  busy.add(key);
  renderItem(key);
  try {
    page = await call({ ...body, name: name || null });
    after?.();
    busy.delete(key);
    render();
  } catch (e) {
    busy.delete(key);
    renderItem(key);
    toast(e instanceof Error ? e.message : 'That did not go. Try again.');
  }
}

// ---------- what shows ----------

function showProblem(message: string): void {
  app.innerHTML = `<div class="bar"><span class="brand">PUNCH LIST</span></div>
  <main class="wrap"><div class="problem"><h1>This list did not open</h1><p>${esc(message)}</p></div></main>`;
}

let toastTimer = 0;
function toast(message: string): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast on';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('on'), 3200);
}

function photoHtml(item: PageItem, photo: PagePhoto, i: number, big: boolean): string {
  return `<button class="ph${big ? ' big' : ''}" data-view="${esc(item.id)}" data-i="${i}" aria-label="Open the photo">
    <img src="${esc(photo.url)}" alt="" loading="lazy" decoding="async">${marksSvg(photo.marks ?? [], photo.width, photo.height)}</button>`;
}

function statusHtml(item: PageItem): string {
  if (item.marked_done_at) return `<span class="pill done">Done</span><span class="note">Waiting for ${esc(page?.builder ?? 'the builder')} to check it</span>`;
  if (isQuoted(item)) return `<span class="pill quote">To Be Quoted</span><span class="note">Extra work: send a price before starting</span>`;
  if (item.ready) return `<span class="pill ok">Ready</span><span class="note">Can be done any time</span>`;
  // The tasks first, each with who is doing it and where, then anyone else it waits on.
  const first = item.waiting_for.map((w) => {
    const about = [w.company, w.location].filter(Boolean).join(', ');
    return about ? `${w.title} (${about})` : w.title;
  });
  const on = andList([...first, ...item.waiting_on]);
  const by = item.ready_by ? `Ready by ${dayText(item.ready_by)}` : 'No ready date yet';
  return `<span class="pill wait">Waiting</span><span class="note">${on ? `On ${esc(on)} · ` : ''}${esc(by)}</span>`;
}

function timeHtml(item: PageItem): string {
  const on = item.hours;
  const other = on !== null && !QUICK_HOURS.includes(on);
  const chips = QUICK_HOURS.map(
    (h) => `<button class="chip${on === h ? ' on' : ''}" data-hours="${h}" data-item="${esc(item.id)}"${busy.has(item.id) ? ' disabled' : ''}>${esc(hoursText(h))}</button>`,
  ).join('');
  const options = [`<option value="">Pick a time</option>`, ...PICK_HOURS.map((h) => `<option value="${h}"${on === h ? ' selected' : ''}>${esc(hoursText(h))}</option>`)].join('');
  return `<div class="field"><div class="label">How long it takes</div>
    <div class="chips">${chips}${other ? `<button class="chip on" data-hours="${on}" data-item="${esc(item.id)}">${esc(hoursText(on!))}</button>` : ''}
    ${choosingTime.has(item.id) ? `<select data-other="${esc(item.id)}" aria-label="Another time">${options}</select>` : `<button class="chip" data-choose="${esc(item.id)}">Other</button>`}</div></div>`;
}

function commentsHtml(key: string, list: PageComment[]): string {
  const shown = list
    .map(
      (c) => `<div class="comment${c.from_company ? ' theirs' : ''}"><div class="who">${esc(c.author || (c.from_company ? page?.company.name : page?.builder) || '')} · ${esc(whenText(c.created_at))}</div><div class="body">${esc(c.body).replace(/\n/g, '<br>')}</div></div>`,
    )
    .join('');
  const draft = drafts.get(key) ?? '';
  return `<div class="comments">${shown}
    <div class="say"><textarea data-draft="${esc(key)}" rows="1" placeholder="${key === 'list' ? 'A comment on the whole list' : 'Comment on this item'}">${esc(draft)}</textarea>
    <button class="send" data-say="${esc(key)}"${busy.has(key) || !draft.trim() ? ' disabled' : ''}>Send</button></div></div>`;
}

function itemHtml(item: PageItem): string {
  const mine = (page?.comments ?? []).filter((c) => c.item_id === item.id);
  const photos = item.photos;
  const facts = [
    item.number !== null ? `Item ${item.number}` : null,
    item.location,
    item.kind === 'deficiency' ? KIND_LABELS.deficiency : item.kind === 'added_scope' ? (isQuoted(item) ? 'Additional' : `Additional, ${item.po_or_co}`) : null,
  ].filter(Boolean);
  const checklist = (item.checklist ?? []).filter((c) => c.text.trim());
  const waiting = busy.has(item.id);
  return `<article class="item${item.confirmed_at ? ' confirmed' : ''}${item.marked_done_at ? ' marked' : ''}" id="item-${esc(item.id)}">
    <div class="facts">${item.priority ? '<span class="priority">Priority</span>' : ''}${esc(facts.join(' · '))}</div>
    <h3>${esc(item.title)}</h3>
    ${item.description ? `<p class="desc">${esc(item.description)}</p>` : ''}
    ${photos.length > 0 ? `<div class="photos">${photos.map((p, i) => photoHtml(item, p, i, i === 0)).join('')}</div>` : ''}
    <div class="status">${statusHtml(item)}</div>
    ${checklist.length > 0 ? `<ul class="steps">${checklist.map((c) => `<li class="${c.done ? 'did' : ''}">${esc(c.text)}</li>`).join('')}</ul>` : ''}
    ${item.marked_done_at ? '' : timeHtml(item)}
    <div class="actions">
      <button class="act${item.confirmed_at ? ' yes' : ''}" data-confirm="${esc(item.id)}"${waiting ? ' disabled' : ''} aria-pressed="${item.confirmed_at ? 'true' : 'false'}">${item.confirmed_at ? '✓ Confirmed' : 'Confirm'}</button>
      <button class="act${item.marked_done_at ? ' yes' : ''}" data-done="${esc(item.id)}"${waiting ? ' disabled' : ''} aria-pressed="${item.marked_done_at ? 'true' : 'false'}">${item.marked_done_at ? 'Not Done After All' : 'Mark Done'}</button>
    </div>
    ${commentsHtml(item.id, mine)}
  </article>`;
}

function sectionHtml(title: string, note: string, items: PageItem[]): string {
  if (items.length === 0) return '';
  return `<section><div class="section"><h2>${esc(title)}</h2><span>${items.length}</span></div><p class="section-note">${esc(note)}</p>${items.map(itemHtml).join('')}</section>`;
}

function render(): void {
  if (!page) return;
  const p = page;
  const open = p.items;
  const done = open.filter((i) => i.marked_done_at);
  const working = open.filter((i) => !i.marked_done_at);
  const quoted = working.filter(isQuoted);
  const ready = working.filter((i) => i.ready && !isQuoted(i));
  const waiting = working.filter((i) => !i.ready && !isQuoted(i));
  const confirmed = open.filter((i) => i.confirmed_at).length;
  const counts = [
    plural(open.length, 'open item'),
    ready.length > 0 ? `${ready.length} ready` : null,
    waiting.length > 0 ? `${waiting.length} waiting` : null,
    confirmed > 0 ? `${confirmed} confirmed` : null,
  ].filter(Boolean);
  const listComments = p.comments.filter((c) => !c.item_id);

  // Typing stays where it was through a refresh.
  const focused = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.dataset.draft : undefined;
  const caret = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.selectionStart : 0;

  app.innerHTML = `<div class="bar"><span class="brand">${esc(p.builder.toUpperCase())}</span><span class="sub">PUNCH LIST</span></div>
  <main class="wrap">
    <header class="head">
      <div class="eyebrow">${esc(p.job.name)}</div>
      <h1>${esc(p.company.name)}</h1>
      ${p.job.address ? `<p class="address">${esc(p.job.address)}</p>` : ''}
      <p class="counts">${esc(counts.join(' · '))}</p>
      ${p.job.closed ? '<p class="closed">This job is closed. Nothing more is needed here.</p>' : ''}
    </header>
    <div class="card you">
      <label class="label" for="name">Your name</label>
      <input id="name" value="${esc(name)}" placeholder="So ${esc(p.builder)} knows who answered" autocomplete="name" maxlength="80">
      <p class="hint">On each item: Confirm it once you have looked it over and it is yours, say about how long it takes, and Mark Done when it is finished. ${esc(p.builder)} sees every answer right away, then checks the work and takes it off.</p>
    </div>
    ${open.length === 0 ? `<div class="card empty"><h2>Nothing open</h2><p>Everything on your list here is done. Thank you.</p></div>` : ''}
    ${sectionHtml('Ready Now', 'These can be done any time.', ready)}
    ${sectionHtml('Waiting', 'Not ready yet: each says what it waits on, and when it should be ready.', waiting)}
    ${sectionHtml('To Be Quoted', 'Extra work: a price for each, before it starts.', quoted)}
    ${sectionHtml('Marked Done', `Waiting for ${p.builder} to check.`, done)}
    <section><div class="section"><h2>The Whole List</h2></div>${commentsHtml('list', listComments)}</section>
    ${
      p.completed.length > 0
        ? `<section><div class="section"><h2>Checked Off Lately</h2><span>${p.completed.length}</span></div><div class="card off">${p.completed
            .map((c) => `<div class="offrow"><span>✓ ${esc(c.title)}</span><span class="where">${esc(c.location)} · ${esc(whenText(c.completed_at))}</span></div>`)
            .join('')}</div></section>`
        : ''
    }
    <footer>${SAMPLE ? 'This is a sample: nothing here is real, and nothing you do on it is sent anywhere.' : `This page is just for ${esc(p.company.name)}: anyone with its link can see it, so keep the link to your team.`}</footer>
  </main>`;

  if (focused) {
    const back = app.querySelector<HTMLTextAreaElement>(`textarea[data-draft="${CSS.escape(focused)}"]`);
    if (back) {
      back.focus();
      back.setSelectionRange(caret ?? back.value.length, caret ?? back.value.length);
    }
  }
}

/** Just one item again, while it is being sent: its buttons wait. */
function renderItem(key: string): void {
  if (!page) return;
  const item = page.items.find((i) => i.id === key);
  const el = document.getElementById(`item-${key}`);
  if (item && el) el.outerHTML = itemHtml(item);
  else if (key === 'list') render();
}

// ---------- the photo, large ----------

function view(itemId: string, index: number): void {
  const item = page?.items.find((i) => i.id === itemId);
  const photo = item?.photos[index];
  if (!item || !photo) return;
  const shade = document.createElement('div');
  shade.className = 'viewer';
  shade.setAttribute('role', 'dialog');
  shade.setAttribute('aria-label', item.title);
  // The photo as large as the screen allows, its own shape, so the marks sit exactly on it.
  const fit = Math.min((window.innerWidth - 32) / (photo.width || 1), (window.innerHeight - 110) / (photo.height || 1));
  const w = Math.round((photo.width || 1) * fit);
  const h = Math.round((photo.height || 1) * fit);
  shade.innerHTML = `<div class="frame" style="width:${w}px;height:${h}px"><img src="${esc(photo.url)}" alt="">${marksSvg(photo.marks ?? [], photo.width, photo.height, 'meet')}</div>
    <div class="viewer-bar"><span>${esc(item.title)}</span><button class="close" aria-label="Close">Close</button></div>`;
  const close = () => shade.remove();
  shade.addEventListener('click', (e) => {
    if (e.target === shade || (e.target as HTMLElement).closest('.close')) close();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  });
  document.body.appendChild(shade);
}

// ---------- what a tap does ----------

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('button');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.view) return view(d.view, Number(d.i ?? 0));
  if (d.confirm) {
    const item = page?.items.find((i) => i.id === d.confirm);
    if (item) void send(item.id, { action: 'confirm', item: item.id, value: !item.confirmed_at });
    return;
  }
  if (d.done) {
    const item = page?.items.find((i) => i.id === d.done);
    if (item) void send(item.id, { action: 'done', item: item.id, value: !item.marked_done_at }, () => toast(item.marked_done_at ? 'Back on your list' : `Marked done. ${page?.builder ?? 'The builder'} will check it.`));
    return;
  }
  if (d.hours && d.item) {
    const item = page?.items.find((i) => i.id === d.item);
    const hours = Number(d.hours);
    if (item) void send(item.id, { action: 'hours', item: item.id, value: item.hours === hours ? null : hours });
    return;
  }
  if (d.choose) {
    choosingTime.add(d.choose);
    renderItem(d.choose);
    return;
  }
  if (d.say) {
    const key = d.say;
    const text = (drafts.get(key) ?? '').trim();
    if (!text) return;
    void send(key, { action: 'comment', item: key === 'list' ? null : key, value: text }, () => drafts.delete(key));
  }
});

app.addEventListener('input', (e) => {
  const el = e.target as HTMLElement;
  if (el instanceof HTMLTextAreaElement && el.dataset.draft) {
    drafts.set(el.dataset.draft, el.value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    const button = el.parentElement?.querySelector<HTMLButtonElement>('button.send');
    if (button) button.disabled = !el.value.trim() || busy.has(el.dataset.draft);
  }
});

app.addEventListener('change', (e) => {
  const el = e.target as HTMLElement;
  if (el instanceof HTMLInputElement && el.id === 'name') {
    name = el.value.replace(/\s+/g, ' ').trim().slice(0, 80);
    remember('punch-name', name);
    if (name) toast(`Answering as ${name}`);
  }
  if (el instanceof HTMLSelectElement && el.dataset.other) {
    const id = el.dataset.other;
    const hours = Number(el.value);
    choosingTime.delete(id);
    if (hours > 0) void send(id, { action: 'hours', item: id, value: hours });
    else renderItem(id);
  }
});

// ---------- keeping it live ----------

function typing(): boolean {
  return document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement || busy.size > 0;
}

// Another link opened in the same tab: start over with it.
window.addEventListener('hashchange', () => location.reload());

if (!SAMPLE && !/^[0-9a-f]{64}$/.test(token)) {
  showProblem('The link is not complete. Open it again from the list or the message it came in.');
} else {
  app.innerHTML = '<div class="bar"><span class="brand">PUNCH LIST</span></div><main class="wrap"><p class="loading">Getting your list</p></main>';
  void load();
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !typing()) void load();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !typing()) void load();
  });
}
