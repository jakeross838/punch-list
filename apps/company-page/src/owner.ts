// The owner's page, from the builder's private link for the owner of the house: no account and no
// app. It shows what was finished lately, with its photos; what is still open in each place; what
// waits on the owner; and what the owner sent. The owner sends something to look at (their words,
// where, and a photo), which comes into the builder's app as a draft from the owner, and signs off
// a place or the whole job under their name.
//
// Built into /o by tools/build-company-page.mjs; it talks only to the company-page function.

import { marksSvg } from '@punch/core';
import { answerOwnerSample, sampleOwnerPage } from './ownerSample';
import { esc, photoForUpload, plural, problemHtml, remember, remembered, toast, typing, viewPhoto, whenText } from './shared';
import type { OwnerPage, PagePhoto } from './types';

declare const FUNCTION_URL: string;

const app = document.getElementById('app')!;
const token = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim().toLowerCase();
const SAMPLE = token === 'sample';
let sample = SAMPLE ? sampleOwnerPage() : null;
const NAME_KEY = 'punch-owner-name';

async function call(body: Record<string, unknown>): Promise<OwnerPage> {
  if (sample) {
    sample = answerOwnerSample(sample, body);
    return JSON.parse(JSON.stringify(sample)) as OwnerPage;
  }
  const res = await fetch(FUNCTION_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ o: token, ...body }) });
  const data = (await res.json().catch(() => ({ error: 'Something went wrong. Try again in a moment.' }))) as OwnerPage & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? 'Something went wrong. Try again in a moment.');
  return data;
}

let page: OwnerPage | null = null;
let name = remembered(NAME_KEY) ?? '';
let words = '';
let where = '';
let shot: { data: string; width: number; height: number; preview: string } | null = null;
/** What is being sent, so its button waits. */
let busy = '';
/** The place being signed off ("job" for the whole job), waiting for the owner to say yes. */
let signing: string | null = null;

/** The finished work, newest first, across every place, with where it is. */
function finished(p: OwnerPage) {
  return p.locations
    .flatMap((l) => l.done.map((d) => ({ ...d, location: l.label })))
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
}

const STATUS: Record<OwnerPage['added'][number]['status'], { pill: string; cls: string; note: (p: OwnerPage) => string }> = {
  received: { pill: 'Received', cls: 'wait', note: (p) => `${p.builder} has it` },
  on_list: { pill: 'On the List', cls: 'ok', note: () => 'Being taken care of' },
  done: { pill: 'Done', cls: 'done', note: () => 'Finished' },
  removed: { pill: 'Not on the List', cls: 'quote', note: (p) => `Ask ${p.builder} about it` },
};

function photoButton(id: string, i: number, photo: PagePhoto, big: boolean): string {
  return `<button class="ph${big ? ' big' : ''}" data-view="${esc(id)}" data-i="${i}" aria-label="Open the photo"><img src="${esc(photo.url)}" alt="" loading="lazy" decoding="async">${marksSvg(photo.marks ?? [], photo.width, photo.height)}${photo.done ? '<span class="tag">Done</span>' : ''}</button>`;
}

function signRow(key: string, label: string, open: number): string {
  if (signing !== key) return `<div class="actions one"><button class="act" data-sign="${esc(key)}"${busy ? ' disabled' : ''}>Sign Off${key === 'job' ? ' the Whole Job' : ''}</button></div>`;
  return `<div class="confirm-sign"><p>${esc(`Sign off ${label}${name ? ` as ${name}` : ''}?`)}${open > 0 ? ` ${esc(plural(open, 'item'))} still open there.` : ''}</p>
    <div class="actions"><button class="act yes" data-sure="${esc(key)}"${busy ? ' disabled' : ''}>Yes, Sign Off</button><button class="act" data-not-yet>Not Yet</button></div></div>`;
}

function render(): void {
  if (!page) return;
  const p = page;
  const open = p.locations.reduce((n, l) => n + l.open.length, 0);
  const done = finished(p);
  const waiting = p.locations.flatMap((l) => l.open.filter((i) => i.waits_on_owner).map((i) => ({ ...i, location: l.label })));
  const places = p.locations.filter((l) => l.open.length > 0 || l.done.length > 0);
  // Typing stays where it was through a refresh.
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && app.contains(active) ? active.id : '';

  app.innerHTML = `<div class="bar"><span class="brand">${esc(p.builder)}</span><span class="sub">Your House</span></div>
  <main class="wrap">
    <header class="head">
      <div class="eyebrow">${esc(p.owner ? `For ${p.owner}` : 'For the owner')}</div>
      <h1>${esc(p.job.name)}</h1>
      ${p.job.address ? `<p class="address">${esc(p.job.address)}</p>` : ''}
      <p class="counts">${esc([plural(open, 'item') + ' open', `${done.length} finished lately`].join(' · '))}</p>
      ${p.job.closed ? '<p class="closed">This job is closed.</p>' : ''}
    </header>
    <div class="card you">
      <label class="label" for="name">Your name</label>
      <input id="name" value="${esc(name)}" placeholder="So ${esc(p.builder)} knows who sent it" autocomplete="name" maxlength="80">
      <p class="hint">Send anything you want looked at, with a photo, and sign off each place when you are happy with it. ${esc(p.builder)} sees it right away.</p>
    </div>
    ${
      waiting.length > 0
        ? `<section><div class="section"><h2>Waiting on You</h2><span>${waiting.length}</span></div><p class="section-note">${esc(p.builder)} needs these from you.</p><div class="card off">${waiting
            .map((i) => `<div class="offrow"><span>${esc(i.title)}</span><span class="where">${esc(i.location)}</span></div>`)
            .join('')}</div></section>`
        : ''
    }
    <section><div class="section"><h2>Send Something to Look At</h2></div>
    <div class="card send-box">
      <label class="label" for="words">What should we look at?</label>
      <textarea id="words" rows="3" maxlength="1000" placeholder="A scratch on the pantry door, a light that flickers">${esc(words)}</textarea>
      <label class="label" for="where">Where (if you know)</label>
      <select id="where"><option value="">Not sure</option>${p.locations.map((l) => `<option value="${esc(l.id)}"${where === l.id ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}</select>
      ${shot ? `<div class="picked"><img src="${esc(shot.preview)}" alt=""><button class="chip" data-unpick>Take Off the Photo</button></div>` : ''}
      <div class="actions">
        <label class="act${busy ? ' off' : ''}"><input type="file" accept="image/*" id="photo" hidden>${shot ? 'Another Photo' : 'Add a Photo'}</label>
        <button class="act yes" data-send${busy || (!words.trim() && !shot) ? ' disabled' : ''}>${busy === 'add' ? 'Sending' : 'Send'}</button>
      </div>
    </div></section>
    ${
      p.added.length > 0
        ? `<section><div class="section"><h2>What You Sent</h2><span>${p.added.length}</span></div><div class="card off">${p.added
            .map((a) => {
              const s = STATUS[a.status];
              return `<div class="offrow sent"><span>${esc(a.title || a.words || 'A photo')}</span><span class="where"><span class="pill ${s.cls}">${esc(s.pill)}</span> ${esc([s.note(p), a.location, whenText(a.created_at)].filter(Boolean).join(' · '))}</span></div>`;
            })
            .join('')}</div></section>`
        : ''
    }
    ${
      done.length > 0
        ? `<section><div class="section"><h2>Finished Lately</h2><span>${done.length}</span></div>${done
            .map(
              (d) => `<article class="item marked"><div class="facts">${esc([d.location, whenText(d.completed_at)].join(' · '))}</div><h3>${esc(d.title)}</h3>
              ${d.photos.length > 0 ? `<div class="photos">${d.photos.map((ph, i) => photoButton(d.id, i, ph, i === 0)).join('')}</div>` : ''}</article>`,
            )
            .join('')}</section>`
        : ''
    }
    <section><div class="section"><h2>Each Place</h2><span>${places.length}</span></div>${places
      .map(
        (l) => `<article class="item place" id="place-${esc(l.id)}"><div class="facts">${esc([l.floor, l.open.length > 0 ? plural(l.open.length, 'item') + ' open' : 'Nothing open'].filter(Boolean).join(' · '))}</div><h3>${esc(l.label)}</h3>
        ${l.open.length > 0 ? `<details><summary>What is still open</summary><ul class="steps">${l.open.map((i) => `<li>${esc(i.title)}</li>`).join('')}</ul></details>` : ''}
        ${signRow(l.id, l.label, l.open.length)}</article>`,
      )
      .join('')}</section>
    <section><div class="section"><h2>Sign Off</h2></div><div class="card">
      <p class="hint">When you are happy with a place, sign it off above. When you are happy with the whole house, sign it off here.</p>
      ${signRow('job', 'the whole job', open)}
      ${
        p.sign_offs.length > 0
          ? `<div class="off">${p.sign_offs.map((s) => `<div class="offrow"><span>✓ ${esc(s.name)} signed off ${esc(s.location ?? 'the whole job')}</span><span class="where">${esc(whenText(s.at))}</span></div>`).join('')}</div>`
          : ''
      }
    </div></section>
    <footer>${SAMPLE ? 'This is a sample: nothing here is real, and nothing you do on it is sent anywhere.' : `This page is just for you: anyone with its link can see it, so keep the link to yourself.`}</footer>
  </main>`;

  if (focused) {
    const back = document.getElementById(focused);
    if (back instanceof HTMLTextAreaElement || back instanceof HTMLInputElement) {
      back.focus();
      back.setSelectionRange(back.value.length, back.value.length);
    }
  }
}

async function load(): Promise<void> {
  try {
    page = await call({ action: 'page' });
    if (!name && page.owner) name = page.owner;
    document.title = `${page.job.name}, ${page.builder}`;
    render();
  } catch (e) {
    if (!page) app.innerHTML = problemHtml('This page did not open', e instanceof Error ? e.message : 'Try again in a moment.');
  }
}

async function send(key: string, body: Record<string, unknown>, done: string): Promise<boolean> {
  if (busy) return false;
  busy = key;
  render();
  try {
    page = await call({ ...body, name: name || null });
    busy = '';
    toast(done);
    render();
    return true;
  } catch (e) {
    busy = '';
    render();
    toast(e instanceof Error ? e.message : 'That did not go. Try again.');
    return false;
  }
}

if (!SAMPLE && !/^[0-9a-f]{64}$/.test(token)) {
  app.innerHTML = problemHtml('This page did not open', 'The link is not complete. Open it again from the message it came in.');
} else {
  app.innerHTML = '<div class="bar"><span class="brand">PUNCH LIST</span></div><main class="wrap"><p class="loading">Getting your house</p></main>';

  app.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el || el.disabled || !page) return;
    const d = el.dataset;
    if (d.view) {
      const item = page.locations.flatMap((l) => l.done).find((x) => x.id === d.view);
      const photo = item?.photos[Number(d.i ?? 0)];
      if (item && photo) viewPhoto(photo, item.title);
      return;
    }
    if (d.unpick !== undefined) {
      shot = null;
      render();
      return;
    }
    if (d.send !== undefined) {
      void send('add', { action: 'add', words, location: where || null, ...(shot ? { photo: shot.data, width: shot.width, height: shot.height } : {}) }, `Sent. ${page.builder} has it.`).then((ok) => {
        if (!ok) return;
        words = '';
        where = '';
        shot = null;
        render();
      });
      return;
    }
    if (d.sign) {
      if (name.trim().length < 2) {
        toast('Type your name at the top first');
        document.getElementById('name')?.focus();
        return;
      }
      signing = d.sign;
      render();
      return;
    }
    if (d.notYet !== undefined) {
      signing = null;
      render();
      return;
    }
    if (d.sure) {
      const key = d.sure;
      const label = key === 'job' ? 'the whole job' : (page.locations.find((l) => l.id === key)?.label ?? 'that place');
      void send('sign', { action: 'sign-off', location: key === 'job' ? null : key }, `Signed off ${label}. Thank you.`).then(() => {
        signing = null;
        render();
      });
    }
  });

  app.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLTextAreaElement && el.id === 'words') {
      words = el.value;
      const button = app.querySelector<HTMLButtonElement>('button[data-send]');
      if (button) button.disabled = !!busy || (!words.trim() && !shot);
    }
  });

  app.addEventListener('change', (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLSelectElement && el.id === 'where') where = el.value;
    if (el instanceof HTMLInputElement && el.id === 'name') {
      name = el.value.replace(/\s+/g, ' ').trim().slice(0, 80);
      remember(NAME_KEY, name);
    }
    if (el instanceof HTMLInputElement && el.id === 'photo') {
      const file = el.files?.[0];
      el.value = '';
      if (!file) return;
      void photoForUpload(file)
        .then((s) => {
          shot = { ...s, preview: `data:image/jpeg;base64,${s.data}` };
          render();
        })
        .catch((err) => toast(err instanceof Error ? err.message : 'That photo did not open. Try another one.'));
    }
  });

  window.addEventListener('hashchange', () => location.reload());
  void load();
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !typing() && !busy && !signing) void load();
  }, 60_000);
}
