// Development only: talks to Buildertrend through a session pasted from Chrome (Copy as cURL),
// the same way the Buildertrend skill does. The session lives in local/creds, which git ignores,
// and is never written anywhere else. The shipped extension never uses this.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BT_ORIGIN, contentTypeFor, parseBody, type Transport } from '@punch/buildertrend';

export const CREDS_DIR = join(process.cwd(), 'local', 'creds');
const COOKIE_FILE = join(CREDS_DIR, 'cookie.txt');
const HEADERS_FILE = join(CREDS_DIR, 'headers.txt');

const KEEP_HEADERS = ['accept', 'accept-language', 'user-agent', 'portaltype', 'sec-ch-ua', 'sec-fetch', 'priority'];

/** Parse a pasted "Copy as cURL (bash)" command into the cookie and the headers worth keeping. */
export function saveSessionFromCurl(curl: string): { cookieChars: number; headers: number } {
  const cookie = extractCookie(curl);
  if (!cookie.includes('ASP.NET_SessionId')) {
    throw new Error('No ASP.NET_SessionId in the pasted command. Copy a request to buildertrend.net as cURL (bash).');
  }
  const headers: string[] = [];
  for (const m of curl.matchAll(/-H\s+(?:\$)?'((?:[^'\\]|\\.)*)'/g)) {
    const h = (m[1] ?? '').replace(/\\'/g, "'");
    const name = h.split(':', 1)[0]?.trim().toLowerCase() ?? '';
    if (name === 'cookie' || name === 'content-type') continue;
    if (KEEP_HEADERS.some((k) => name === k || name.startsWith(k))) headers.push(h.trim());
  }
  mkdirSync(CREDS_DIR, { recursive: true });
  writeFileSync(COOKIE_FILE, `${cookie.trim()}\n`);
  chmodSync(COOKIE_FILE, 0o600);
  writeFileSync(HEADERS_FILE, `${headers.join('\n')}\n`);
  return { cookieChars: cookie.length, headers: headers.length };
}

function extractCookie(curl: string): string {
  const patterns = [
    /-b\s+\$'((?:[^'\\]|\\.)*)'/,
    /-b\s+'([^']*)'/,
    /-b\s+"([^"]*)"/,
    /-H\s+\$'cookie:\s*((?:[^'\\]|\\.)*)'/i,
    /-H\s+'cookie:\s*([^']*)'/i,
  ];
  for (const p of patterns) {
    const m = curl.match(p);
    if (m?.[1]) return m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return '';
}

export function hasSession(): boolean {
  return existsSync(COOKIE_FILE);
}

export function curlTransport(): Transport {
  if (!hasSession()) throw new Error('No Buildertrend session. Run: npm run phase0 -- session "<Copy as cURL>"');
  const cookie = readFileSync(COOKIE_FILE, 'utf8').trim();
  const extra = existsSync(HEADERS_FILE)
    ? readFileSync(HEADERS_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    : [];
  return {
    async request(method, path, body) {
      const args = ['-sS', '--max-time', '90', '-b', cookie, '-w', '\n__HTTP:%{http_code}', '-X', method];
      args.push('-H', `origin: ${BT_ORIGIN}`, '-H', `referer: ${BT_ORIGIN}/app/`);
      if (!extra.some((h) => h.toLowerCase().startsWith('portaltype'))) args.push('-H', 'portaltype: 1');
      for (const h of extra) args.push('-H', h);
      let input: string | undefined;
      if (body !== undefined) {
        args.push('-H', `content-type: ${contentTypeFor(path)}`, '--data-binary', '@-');
        input = JSON.stringify(body);
      }
      args.push(`${BT_ORIGIN}${path}`);
      const out = spawnSync('curl', args, { input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      if (out.error) throw out.error;
      const stdout = out.stdout ?? '';
      const at = stdout.lastIndexOf('__HTTP:');
      const status = at >= 0 ? Number(stdout.slice(at + 7).trim()) : 0;
      const text = at >= 0 ? stdout.slice(0, at).replace(/\n$/, '') : stdout;
      if (status === 0 && out.stderr) throw new Error(`curl: ${out.stderr.trim()}`);
      return { status, data: parseBody(text), text };
    },
  };
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
