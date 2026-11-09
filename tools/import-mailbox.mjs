// The build workspace's side of the temporary import mailbox (`setup.md`, Fish from Buildertrend):
// brings what a signed in Buildertrend page sent into local/, and puts the list in the app's shape
// back for the loader. The workspace's key is in local/secrets/import.key and is never printed; the
// database knows only its hash.
//
//   node tools/import-mailbox.mjs get raw <first part> <out file> [sha256 the page reported]
//   node tools/import-mailbox.mjs put <file>          the list `npm run import:buildertrend` wrote
//
// A part is base64 text. `get` reads from the first part on until a part is missing, and refuses a
// file whose hash is not the one the page reported.

import crypto from 'node:crypto';
import fs from 'node:fs';

const PART = 900_000;
const env = Object.fromEntries(
  fs.readFileSync('apps/mobile/.env', 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const key = fs.readFileSync('local/secrets/import.key', 'utf8').trim();

async function rpc(name, body) {
  const r = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // The status only: an error body can repeat what was sent, and the key is part of that.
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const [command, ...args] = process.argv.slice(2);
if (command === 'get') {
  const [box, first, out, expect] = args;
  let b64 = '';
  for (let part = Number(first); part < 64; part += 1) {
    const body = await rpc('import_mailbox_get', { key, box, part });
    if (body === null) break;
    b64 += body;
  }
  if (b64 === '') throw new Error('Nothing in that part of the mailbox');
  const bytes = Buffer.from(b64, 'base64');
  if (expect && sha256(bytes) !== expect) throw new Error('The hash is not the one the page reported');
  fs.writeFileSync(out, bytes);
  console.log(`${bytes.length} bytes${expect ? ', the hash matches' : `, sha256 ${sha256(bytes)}`}; wrote ${out}`);
} else if (command === 'put') {
  const bytes = fs.readFileSync(args[0]);
  const b64 = bytes.toString('base64');
  const parts = [];
  for (let i = 0; i < b64.length; i += PART) parts.push(b64.slice(i, i + PART));
  for (let part = 0; part < parts.length; part += 1) await rpc('import_mailbox_put', { key, part, body: parts[part] });
  // Read it back: what the loader will read is what was sent.
  let back = '';
  for (let part = 0; part < 64; part += 1) {
    const body = await rpc('import_mailbox_get', { key, box: 'mapped', part });
    if (body === null) break;
    back += body;
  }
  if (sha256(Buffer.from(back, 'base64')) !== sha256(bytes)) throw new Error('What is in the mailbox is not what was sent: an older, longer list may still be there');
  console.log(`${bytes.length} bytes in ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}, read back the same, sha256 ${sha256(bytes)}`);
} else {
  console.log('Usage: node tools/import-mailbox.mjs get raw <first part> <out file> [sha256]   or   put <file>');
  process.exitCode = 1;
}
