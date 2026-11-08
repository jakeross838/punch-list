// A company's list, as its page shows it and as the job's station shows it when the company taps its
// name: its open items on the job with their marked up photos, ready now or what each waits on and
// when it should be ready, numbered in the order to do them (the same order as its printed list:
// Priority first, then whatever holds up the most other work), then what was checked off lately. On
// each item it confirms the item, says how long it takes, marks it done for the builder to check,
// sends a photo of the finished work, and comments, under the name typed at the top. A company
// whose page is in Spanish sees it in Spanish, its list's lines as Claude translated them, with a
// button to see it in English. On its own page it also has its links to its other jobs.

import { doFirst, FREES_NOTHING, marksSvg, PICK_HOURS, QUICK_HOURS } from '@punch/core';
import { andList, dayText, esc, isQuoted, photoForUpload, remember, remembered, toast, typing, viewPhoto, whenText } from './shared';
import type { Page, PageComment, PageItem, PagePhoto } from './types';
import { EN, lineIn, wordsFor, type Lang, type Words } from './words';

export interface ListOptions {
  /** Where the list draws. */
  root: HTMLElement;
  /** Asks the function for the list, or sends an answer: the reply is the list as it now stands. */
  call: (body: Record<string, unknown>) => Promise<Page>;
  /** Where the name typed is kept on this device. */
  nameKey: string;
  /** The bar along the top. */
  bar: (page: Page) => string;
  /** The line at the very end, in the list's language. */
  footer: (page: Page, w: Words) => string;
  /** Where the language picked is kept on this device; without it, the pick lasts while the list is open. */
  langKey?: string;
  /** Where the company's other jobs open: its page's address before the link. None on a station. */
  otherJobsAt?: string;
  /** When the list does not open at all. */
  onProblem: (message: string) => void;
}

export interface ListView {
  load(): Promise<void>;
  /** Typing, or an answer on its way: a refresh waits. */
  waiting(): boolean;
  /** Stops listening, for the next view to take the root. */
  destroy(): void;
}

export function mountList(o: ListOptions): ListView {
  const { root } = o;
  let page: Page | null = null;
  let name = remembered(o.nameKey) ?? '';
  /** What is being sent, by item ("list" for the whole list), so its buttons wait. */
  const busy = new Set<string>();
  /** Comments being written, kept through every refresh. */
  const drafts = new Map<string, string>();
  /** Items whose Other time list is open. */
  const choosingTime = new Set<string>();
  /** Each item's number in the order to do the work, from the last time the list was drawn. */
  let steps = new Map<string, number>();
  let gone = false;
  /** The language picked here, over the company's own. */
  const kept = o.langKey ? remembered(o.langKey) : null;
  let picked: Lang | null = kept === 'en' || kept === 'es' ? kept : null;
  /** The words the list is in now. */
  let w: Words = EN;
  const langOf = (p: Page): Lang => picked ?? (p.company.language === 'es' ? 'es' : 'en');
  /** A line of the builder's, in the list's language. */
  const tr = (text: string) => lineIn(w, page?.translations, text);
  /** A photo's marks, their words in the list's language. */
  const marksIn = (photo: PagePhoto) => (photo.marks ?? []).map((m) => (m.tool === 'text' && m.text ? { ...m, text: tr(m.text) } : m));

  const take = (got: Page): Page => ({ ...got, builder: got.builder || 'Your builder', completed: got.completed ?? [], comments: got.comments ?? [], items: got.items ?? [] });

  async function load(): Promise<void> {
    try {
      const got = await o.call({ action: 'page' });
      if (gone) return;
      // An older answer may leave a part out: the list still shows what it has.
      page = take(got);
      w = wordsFor(langOf(page));
      document.title = `${page.company.name}, ${page.job.name}`;
      render();
    } catch (e) {
      if (!page && !gone) o.onProblem(e instanceof Error ? e.message : 'This list did not open. Try again in a moment.');
    }
  }

  async function send(key: string, body: Record<string, unknown>, after?: () => void): Promise<void> {
    if (busy.has(key)) return;
    busy.add(key);
    renderItem(key);
    try {
      const got = await o.call({ ...body, name: name || null });
      if (gone) return;
      page = take(got);
      w = wordsFor(langOf(page));
      after?.();
      busy.delete(key);
      render();
    } catch (e) {
      busy.delete(key);
      renderItem(key);
      toast(e instanceof Error ? e.message : w.didNotGo);
    }
  }

  // ---------- what shows ----------

  function photoHtml(item: PageItem, photo: PagePhoto, i: number, big: boolean): string {
    return `<button class="ph${big ? ' big' : ''}" data-view="${esc(item.id)}" data-i="${i}" aria-label="${esc(w.openPhoto)}">
    <img src="${esc(photo.url)}" alt="" loading="lazy" decoding="async">${marksSvg(marksIn(photo), photo.width, photo.height)}${photo.done ? `<span class="tag">${esc(w.done)}</span>` : ''}</button>`;
  }

  function statusHtml(item: PageItem): string {
    if (item.marked_done_at) return `<span class="pill done">${esc(w.done)}</span><span class="note">${esc(w.waitingForCheck(page?.builder ?? 'the builder'))}</span>`;
    if (isQuoted(item)) return `<span class="pill quote">${esc(w.toBeQuoted)}</span><span class="note">${esc(w.quoteNote)}</span>`;
    if (item.ready) return `<span class="pill ok">${esc(w.ready)}</span><span class="note">${esc(w.readyNote)}</span>`;
    // The tasks first, each with who is doing it and where, then anyone else it waits on.
    const first = item.waiting_for.map((f) => {
      const about = [f.company, f.location].filter(Boolean).join(', ');
      return about ? `${tr(f.title)} (${about})` : tr(f.title);
    });
    const on = w.lang === 'es' ? [...first, ...item.waiting_on.map(tr)].join(', ') : andList([...first, ...item.waiting_on]);
    const by = item.ready_by ? w.readyBy(dayText(item.ready_by, w)) : w.noReadyDate;
    return `<span class="pill wait">${esc(w.waiting)}</span><span class="note">${on ? `${esc(w.on(on))} · ` : ''}${esc(by)}</span>`;
  }

  function timeHtml(item: PageItem): string {
    const on = item.hours;
    const other = on !== null && !QUICK_HOURS.includes(on);
    const chips = QUICK_HOURS.map(
      (h) => `<button class="chip${on === h ? ' on' : ''}" data-hours="${h}" data-item="${esc(item.id)}"${busy.has(item.id) ? ' disabled' : ''}>${esc(w.hours(h))}</button>`,
    ).join('');
    const options = [`<option value="">${esc(w.pickATime)}</option>`, ...PICK_HOURS.map((h) => `<option value="${h}"${on === h ? ' selected' : ''}>${esc(w.hours(h))}</option>`)].join('');
    return `<div class="field"><div class="label">${esc(w.howLong)}</div>
    <div class="chips">${chips}${other ? `<button class="chip on" data-hours="${on}" data-item="${esc(item.id)}">${esc(w.hours(on!))}</button>` : ''}
    ${choosingTime.has(item.id) ? `<select data-other="${esc(item.id)}" aria-label="${esc(w.anotherTime)}">${options}</select>` : `<button class="chip" data-choose="${esc(item.id)}">${esc(w.other_)}</button>`}</div></div>`;
  }

  function commentsHtml(key: string, list: PageComment[]): string {
    const shown = list
      .map(
        (c) =>
          `<div class="comment${c.from_company ? ' theirs' : ''}"><div class="who">${esc(c.author || (c.from_company ? page?.company.name : page?.builder) || '')} · ${esc(whenText(c.created_at, w))}</div><div class="body">${esc(c.from_company ? c.body : tr(c.body)).replace(/\n/g, '<br>')}</div></div>`,
      )
      .join('');
    const draft = drafts.get(key) ?? '';
    return `<div class="comments">${shown}
    <div class="say"><textarea data-draft="${esc(key)}" rows="1" placeholder="${esc(key === 'list' ? w.commentOnList : w.commentOnItem)}">${esc(draft)}</textarea>
    <button class="send" data-say="${esc(key)}"${busy.has(key) || !draft.trim() ? ' disabled' : ''}>${esc(w.send)}</button></div></div>`;
  }

  /** The facts the order goes by, for an item on the list. */
  const workFacts = (item: PageItem) => ({ ready: item.ready, priority: item.priority, readyBy: item.ready_by, freed: item.holds_up ?? FREES_NOTHING });

  function itemHtml(item: PageItem): string {
    const mine = (page?.comments ?? []).filter((c) => c.item_id === item.id);
    const photos = item.photos;
    const step = steps.get(item.id);
    const freed = item.holds_up ?? FREES_NOTHING;
    const facts = [
      item.number !== null ? w.item(item.number) : null,
      item.location,
      item.kind === 'deficiency' ? w.deficiency : item.kind === 'added_scope' ? (isQuoted(item) ? w.additional : `${w.additional}, ${item.po_or_co}`) : null,
      item.marked_done_at || freed.items <= 0 ? null : w.holdsUp(freed.items),
    ].filter(Boolean);
    const checklist = (item.checklist ?? []).filter((c) => c.text.trim());
    const waiting = busy.has(item.id);
    return `<article class="item${item.confirmed_at ? ' confirmed' : ''}${item.marked_done_at ? ' marked' : ''}" id="item-${esc(item.id)}">
    <div class="facts">${step ? `<span class="step" aria-label="${esc(w.step(step))}">${step}</span>` : ''}${item.priority ? `<span class="priority">${esc(w.priority)}</span>` : ''}${esc(facts.join(' · '))}</div>
    <h3>${esc(tr(item.title))}</h3>
    ${item.description ? `<p class="desc">${esc(tr(item.description))}</p>` : ''}
    ${photos.length > 0 ? `<div class="photos">${photos.map((p, i) => photoHtml(item, p, i, i === 0)).join('')}</div>` : ''}
    <div class="status">${statusHtml(item)}</div>
    ${checklist.length > 0 ? `<ul class="steps">${checklist.map((c) => `<li class="${c.done ? 'did' : ''}">${esc(tr(c.text))}</li>`).join('')}</ul>` : ''}
    ${item.marked_done_at ? '' : timeHtml(item)}
    <div class="actions">
      <button class="act${item.confirmed_at ? ' yes' : ''}" data-confirm="${esc(item.id)}"${waiting ? ' disabled' : ''} aria-pressed="${item.confirmed_at ? 'true' : 'false'}">${esc(item.confirmed_at ? w.confirmed : w.confirm)}</button>
      <button class="act${item.marked_done_at ? ' yes' : ''}" data-done="${esc(item.id)}"${waiting ? ' disabled' : ''} aria-pressed="${item.marked_done_at ? 'true' : 'false'}">${esc(item.marked_done_at ? w.notDone : w.markDone)}</button>
      <label class="act wide${waiting ? ' off' : ''}"><input type="file" accept="image/*" data-photo="${esc(item.id)}" hidden${waiting ? ' disabled' : ''}>${esc(photos.some((p) => p.done) ? w.addAnotherPhoto : w.addPhoto)}</label>
    </div>
    ${commentsHtml(item.id, mine)}
  </article>`;
  }

  function sectionHtml(title: string, note: string, items: PageItem[]): string {
    if (items.length === 0) return '';
    return `<section><div class="section"><h2>${esc(title)}</h2><span>${items.length}</span></div><p class="section-note">${esc(note)}</p>${items.map(itemHtml).join('')}</section>`;
  }

  function render(): void {
    if (!page || gone) return;
    const p = page;
    const open = p.items;
    const done = open.filter((i) => i.marked_done_at);
    const working = open.filter((i) => !i.marked_done_at);
    const quoted = working.filter(isQuoted);
    // In the order to do them, numbered on from what is ready to what is waiting.
    const inOrder = (list: PageItem[]) => [...list].sort((a, b) => doFirst(workFacts(a), workFacts(b)));
    const ready = inOrder(working.filter((i) => i.ready && !isQuoted(i)));
    const waiting = inOrder(working.filter((i) => !i.ready && !isQuoted(i)));
    steps = new Map([...ready, ...waiting].map((i, n) => [i.id, n + 1]));
    const ordered = ready.some((i) => i.priority || (i.holds_up?.items ?? 0) > 0);
    const confirmed = open.filter((i) => i.confirmed_at).length;
    const counts = [
      w.openItems(open.length),
      ready.length > 0 ? w.readyCount(ready.length) : null,
      waiting.length > 0 ? w.waitingCount(waiting.length) : null,
      confirmed > 0 ? w.confirmedCount(confirmed) : null,
    ].filter(Boolean);
    const listComments = p.comments.filter((c) => !c.item_id);
    // The button to the other language, for a company whose page is in Spanish.
    const canSwitch = p.company.language === 'es' || picked === 'es';
    const others = o.otherJobsAt ? (p.other_jobs ?? []) : [];

    // Typing stays where it was through a refresh.
    const active = document.activeElement;
    const focused = active instanceof HTMLTextAreaElement && root.contains(active) ? active.dataset.draft : undefined;
    const caret = active instanceof HTMLTextAreaElement ? active.selectionStart : 0;

    root.innerHTML = `${o.bar(p)}
  <main class="wrap">
    <header class="head">
      <div class="eyebrow">${esc(p.job.name)}</div>
      <h1>${esc(p.company.name)}</h1>
      ${p.job.address ? `<p class="address">${esc(p.job.address)}</p>` : ''}
      <p class="counts">${esc(counts.join(' · '))}</p>
      ${canSwitch ? `<button class="lang" data-lang="${w.lang === 'es' ? 'en' : 'es'}">${esc(w.other)}</button>` : ''}
      ${p.job.closed ? `<p class="closed">${esc(w.closed)}</p>` : ''}
    </header>
    <div class="card you">
      <label class="label" for="name">${esc(w.yourName)}</label>
      <input id="name" value="${esc(name)}" placeholder="${esc(w.soKnows(p.builder))}" autocomplete="name" maxlength="80">
      <p class="hint">${esc(w.hint(p.builder))}</p>
    </div>
    ${open.length === 0 ? `<div class="card empty"><h2>${esc(w.nothingOpen)}</h2><p>${esc(w.allDone)}</p></div>` : ''}
    ${sectionHtml(w.readyNow, ordered ? w.startAtOne : w.anyTime, ready)}
    ${sectionHtml(w.waiting, w.eachSays, waiting)}
    ${sectionHtml(w.toBeQuoted, w.quoteEach, quoted)}
    ${sectionHtml(w.markedDone, w.waitingForCheckAll(p.builder), done)}
    <section><div class="section"><h2>${esc(w.wholeList)}</h2></div>${commentsHtml('list', listComments)}</section>
    ${
      p.completed.length > 0
        ? `<section><div class="section"><h2>${esc(w.checkedOff)}</h2><span>${p.completed.length}</span></div><div class="card off">${p.completed
            .map((c) => `<div class="offrow"><span>✓ ${esc(tr(c.title))}</span><span class="where">${esc(c.location)} · ${esc(whenText(c.completed_at, w))}</span></div>`)
            .join('')}</div></section>`
        : ''
    }
    ${
      others.length > 0
        ? `<section><div class="section"><h2>${esc(w.otherJobs(p.builder))}</h2><span>${others.length}</span></div><div class="card off">${others
            .map(
              (j) =>
                `<a class="offrow job" href="${esc(`${o.otherJobsAt}#${j.token}`)}" data-job="${esc(j.token)}"><span>${esc(j.name)}</span><span class="where">${esc([j.address, w.openItems(j.open)].filter(Boolean).join(' · '))}</span></a>`,
            )
            .join('')}</div></section>`
        : ''
    }
    <footer>${o.footer(p, w)}</footer>
  </main>`;

    if (focused) {
      const back = root.querySelector<HTMLTextAreaElement>(`textarea[data-draft="${CSS.escape(focused)}"]`);
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
    const el = root.querySelector(`[id="item-${CSS.escape(key)}"]`);
    if (item && el) el.outerHTML = itemHtml(item);
    else if (key === 'list') render();
  }

  // ---------- what a tap does ----------

  const onClick = (e: Event) => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || el.disabled) return;
    const d = el.dataset;
    if (d.lang === 'en' || d.lang === 'es') {
      picked = d.lang;
      if (o.langKey) remember(o.langKey, d.lang);
      if (page) w = wordsFor(langOf(page));
      render();
      return;
    }
    if (d.view) {
      const item = page?.items.find((i) => i.id === d.view);
      const photo = item?.photos[Number(d.i ?? 0)];
      if (item && photo) viewPhoto({ ...photo, marks: marksIn(photo) }, tr(item.title));
      return;
    }
    if (d.confirm) {
      const item = page?.items.find((i) => i.id === d.confirm);
      if (item) void send(item.id, { action: 'confirm', item: item.id, value: !item.confirmed_at });
      return;
    }
    if (d.done) {
      const item = page?.items.find((i) => i.id === d.done);
      if (item) void send(item.id, { action: 'done', item: item.id, value: !item.marked_done_at }, () => toast(item.marked_done_at ? w.backOnList : w.markedDoneToast(page?.builder ?? 'The builder')));
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
  };

  const onInput = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLTextAreaElement && el.dataset.draft) {
      drafts.set(el.dataset.draft, el.value);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
      const button = el.parentElement?.querySelector<HTMLButtonElement>('button.send');
      if (button) button.disabled = !el.value.trim() || busy.has(el.dataset.draft);
    }
  };

  /** A photo of the finished work, made smaller here, then sent. */
  async function sendPhoto(id: string, file: File): Promise<void> {
    if (busy.has(id)) return;
    try {
      const shot = await photoForUpload(file);
      await send(id, { action: 'photo', item: id, value: shot.data, width: shot.width, height: shot.height }, () => toast(w.photoSent(page?.builder ?? 'The builder')));
    } catch (e) {
      toast(e instanceof Error ? e.message : w.photoDidNotGo);
    }
  }

  const onChange = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.type === 'file' && el.dataset.photo) {
      const file = el.files?.[0];
      const id = el.dataset.photo;
      el.value = '';
      if (file) void sendPhoto(id, file);
      return;
    }
    if (el instanceof HTMLInputElement && el.id === 'name') {
      name = el.value.replace(/\s+/g, ' ').trim().slice(0, 80);
      remember(o.nameKey, name);
      if (name) toast(w.answeringAs(name));
    }
    if (el instanceof HTMLSelectElement && el.dataset.other) {
      const id = el.dataset.other;
      const hours = Number(el.value);
      choosingTime.delete(id);
      if (hours > 0) void send(id, { action: 'hours', item: id, value: hours });
      else renderItem(id);
    }
  };

  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);

  return {
    load,
    waiting: () => typing() || busy.size > 0,
    destroy: () => {
      gone = true;
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
    },
  };
}
