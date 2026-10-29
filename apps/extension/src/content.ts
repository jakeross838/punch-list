// The panel that runs inside a logged-in Buildertrend tab. Every request goes out from the page
// itself, with the page's own session: no password or cookie is read, stored or sent anywhere else.
// Styles are set through the style object, which the page's content security policy allows.

import {
  errorText,
  fetchTransport,
  recordingTransport,
  runPhase0Read,
  runPhase0Write,
  type CallRecord,
  type Check,
  type Phase0ReadResult,
  type Phase0WriteResult,
} from '@punch/buildertrend';

const INK = '#3B5864';
const BLUE = '#4E7A8C';
const HAIRLINE = '#CBD8DB';
const CREAM = '#F7F5EC';
const STATUS_COLOR: Record<Check['status'], string> = {
  pass: '#2E7D4F',
  fail: '#B3261E',
  manual: '#8A6D1D',
  blocked: '#8A6D1D',
  skipped: '#6B7B83',
};
const STATUS_WORD: Record<Check['status'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  manual: 'Look',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

let panel: HTMLElement | null = null;
let busy = false;
let read: Phase0ReadResult | undefined;
let write: Phase0WriteResult | undefined;
const calls: CallRecord[] = [];

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === 'toggle-panel') togglePanel();
});

function togglePanel(): void {
  if (panel) {
    panel.remove();
    panel = null;
    return;
  }
  panel = buildPanel();
  document.body.appendChild(panel);
}

function buildPanel(): HTMLElement {
  const root = el('div', {
    position: 'fixed',
    top: '16px',
    right: '16px',
    width: '420px',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    zIndex: '2147483647',
    background: '#FFFFFF',
    color: INK,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    font: '13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif',
    padding: '16px',
  });

  const header = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' });
  header.append(
    text('div', 'Punch List Bridge: Phase 0', { fontWeight: '700', fontSize: '15px' }),
    button('Close', () => togglePanel(), true),
  );
  root.append(header);
  root.append(
    text(
      'div',
      'Read checks look at Fish and change nothing. Write checks use only the sandbox job and remove their own test tasks at the end.',
      { color: BLUE, marginBottom: '12px' },
    ),
  );

  const actions = el('div', { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' });
  const status = text('div', 'Ready.', { margin: '8px 0', fontWeight: '600' });
  const results = el('div', {});
  actions.append(
    button('1. Run read checks (Fish, read only)', () => run(status, results, 'read')),
    button('2. Run write checks (sandbox only)', () => run(status, results, 'write')),
    button('3. Download the report', () => download()),
  );
  root.append(actions, status, results);
  return root;
}

async function run(status: HTMLElement, results: HTMLElement, mode: 'read' | 'write'): Promise<void> {
  if (busy) return;
  busy = true;
  const t = recordingTransport(fetchTransport(), calls);
  try {
    if (mode === 'read') {
      status.textContent = 'Reading Fish…';
      read = await runPhase0Read(t);
    } else {
      if (!read) {
        status.textContent = 'Reading Fish first, for the field shapes…';
        read = await runPhase0Read(t);
      }
      status.textContent = 'Writing to the sandbox and reading every step back…';
      write = await runPhase0Write(t, {
        sampleTasks: read.rawFishTasks ?? [],
        ...(read.definitions.length ? { definitions: read.definitions } : {}),
        ...(read.tags.length ? { tags: read.tags } : {}),
        ...(read.fish?.stats.trades[0] ? { tradeTagName: read.fish.stats.trades[0].name } : {}),
      });
    }
    status.textContent = 'Done. Download the report and send it over.';
  } catch (e) {
    status.textContent = `Stopped: ${errorText(e)}`;
  } finally {
    busy = false;
    render(results);
  }
}

function render(results: HTMLElement): void {
  results.replaceChildren();
  const sections: Array<[string, Check[] | undefined]> = [
    ['Read checks', read?.checks],
    ['Write checks', write?.checks],
  ];
  for (const [title, checks] of sections) {
    if (!checks) continue;
    results.append(text('div', title, { fontWeight: '700', margin: '12px 0 4px' }));
    checks.forEach((c, i) => {
      const row = el('div', {
        display: 'grid',
        gridTemplateColumns: '64px 1fr',
        gap: '8px',
        padding: '6px 8px',
        background: i % 2 ? CREAM : '#FFFFFF',
        borderTop: `1px solid ${HAIRLINE}`,
      });
      row.append(
        text('div', STATUS_WORD[c.status], { color: STATUS_COLOR[c.status], fontWeight: '700' }),
        text('div', `${c.id} ${c.name}. ${c.detail}`, {}),
      );
      results.append(row);
    });
  }
}

function download(): void {
  const report = { generatedAt: new Date().toISOString(), from: 'extension', read, write, calls };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `phase0-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- tiny DOM helpers ----------

type Style = Partial<Record<keyof CSSStyleDeclaration, string>>;

function el(tag: string, style: Style): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  return node;
}

function text(tag: string, content: string, style: Style): HTMLElement {
  const node = el(tag, style);
  node.textContent = content;
  return node;
}

function button(label: string, onClick: () => void, quiet = false): HTMLElement {
  const b = el('button', {
    padding: quiet ? '4px 8px' : '8px 12px',
    border: `1px solid ${quiet ? HAIRLINE : BLUE}`,
    borderRadius: '6px',
    background: quiet ? '#FFFFFF' : BLUE,
    color: quiet ? INK : '#FFFFFF',
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: '600',
    textAlign: 'left',
  });
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
