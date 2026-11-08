// The company's page: what a company sees from the private link on the list it was sent, with no
// account and no app: its list (list.ts), under the name typed once at the top. It asks again every
// minute it is open, so the list stays live.
//
// Built into one page by tools/build-company-page.mjs; it talks only to the company-page function.

import { mountList } from './list';
import { answerSample, samplePage } from './sample';
import { esc, problemHtml } from './shared';
import type { Page } from './types';

declare const FUNCTION_URL: string;

const app = document.getElementById('app')!;
const token = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim().toLowerCase();
/** The sample page: made up work, answered here and sent nowhere. */
const SAMPLE = token === 'sample';
let sample = SAMPLE ? samplePage() : null;

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

// Another link opened in the same tab: start over with it.
window.addEventListener('hashchange', () => location.reload());

if (!SAMPLE && !/^[0-9a-f]{64}$/.test(token)) {
  app.innerHTML = problemHtml('This list did not open', 'The link is not complete. Open it again from the list or the message it came in.');
} else {
  app.innerHTML = '<div class="bar"><span class="brand">PUNCH LIST</span></div><main class="wrap"><p class="loading">Getting your list</p></main>';
  const list = mountList({
    root: app,
    call,
    nameKey: 'punch-name',
    langKey: 'punch-language',
    otherJobsAt: '/c',
    bar: (p) => `<div class="bar"><span class="brand">${esc(p.builder)}</span><span class="sub">Punch List</span></div>`,
    footer: (p, w) =>
      SAMPLE
        ? w.lang === 'es'
          ? 'Esta es una muestra: nada aquí es real, y nada de lo que haga se envía.'
          : 'This is a sample: nothing here is real, and nothing you do on it is sent anywhere.'
        : w.lang === 'es'
          ? `Esta página es solo para ${esc(p.company.name)}: cualquiera con el enlace la puede ver, así que compártalo solo con su equipo.`
          : `This page is just for ${esc(p.company.name)}: anyone with its link can see it, so keep the link to your team.`,
    onProblem: (message) => {
      app.innerHTML = problemHtml('This list did not open', message);
    },
  });
  void list.load();
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && !list.waiting()) void list.load();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !list.waiting()) void list.load();
  });
}
