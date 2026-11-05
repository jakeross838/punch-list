// Uploads an .ipa straight to App Store Connect with Apple's build upload API (the same calls Expo's
// submit makes), so a build reaches TestFlight without waiting in Expo's submission queue.
//
//   node tools/upload-testflight.mjs <path to .ipa> <version> <build number>
//
// The App Store Connect API key comes from local/secrets/apple.env and the .p8 it names.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = '6831305928';
const [ipaPath, version, buildNumber] = process.argv.slice(2);
if (!ipaPath || !version || !buildNumber) {
  console.error('Usage: node tools/upload-testflight.mjs <path to .ipa> <version> <build number>');
  process.exit(2);
}

const secrets = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'local', 'secrets', 'apple.env');
const env = Object.fromEntries(
  fs.readFileSync(secrets, 'utf8').trim().split('\n').map((line) => line.split('=')),
);
const key = fs.readFileSync(env.EXPO_ASC_API_KEY_PATH, 'utf8');

function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: env.EXPO_ASC_KEY_ID, typ: 'JWT' });
  const body = b64({ iss: env.EXPO_ASC_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function api(method, route, json) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${route}`, {
    method,
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${route} failed: ${r.status} ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

const ipa = fs.readFileSync(ipaPath);
const md5 = crypto.createHash('md5').update(ipa).digest('hex');
console.log(`ipa ${path.basename(ipaPath)}: ${ipa.length} bytes, md5 ${md5}`);

const upload = await api('POST', '/v1/buildUploads', {
  data: {
    type: 'buildUploads',
    attributes: { cfBundleShortVersionString: version, cfBundleVersion: buildNumber, platform: 'IOS' },
    relationships: { app: { data: { type: 'apps', id: APP_ID } } },
  },
});
const uploadId = upload.data.id;
console.log('build upload', uploadId);

async function abandon(reason) {
  console.error(reason);
  try {
    await api('DELETE', `/v1/buildUploads/${uploadId}`);
    console.error('removed the unfinished build upload');
  } catch (e) {
    console.error('could not remove the build upload:', e.message);
  }
  process.exit(1);
}

let file;
try {
  file = await api('POST', '/v1/buildUploadFiles', {
    data: {
      type: 'buildUploadFiles',
      attributes: { assetType: 'ASSET', fileName: path.basename(ipaPath), fileSize: ipa.length, uti: 'com.apple.ipa' },
      relationships: { buildUpload: { data: { type: 'buildUploads', id: uploadId } } },
    },
  });
} catch (e) {
  await abandon(e.message);
}
const fileId = file.data.id;
let operations = file.data.attributes.uploadOperations;
if (!operations?.length) {
  operations = (await api('GET', `/v1/buildUploadFiles/${fileId}`)).data.attributes.uploadOperations;
}
if (!operations?.length) await abandon('Apple gave no upload operations');
console.log(`${operations.length} parts to ${new URL(operations[0].url).host}`);

for (const [i, op] of operations.entries()) {
  const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
  const chunk = ipa.subarray(op.offset, op.offset + op.length);
  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    const r = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (r.ok) ok = true;
    else {
      const text = (await r.text()).slice(0, 300);
      console.error(`part ${i + 1} attempt ${attempt}: ${r.status} ${text}`);
      if (/request blocked|no rule allows host/i.test(text)) await abandon('The network here blocks that upload host.');
    }
  }
  if (!ok) await abandon(`part ${i + 1} did not upload`);
  console.log(`part ${i + 1} of ${operations.length} up`);
}

await api('PATCH', `/v1/buildUploadFiles/${fileId}`, {
  data: {
    type: 'buildUploadFiles',
    id: fileId,
    attributes: { sourceFileChecksums: { file: { hash: md5, algorithm: 'MD5' } }, uploaded: true },
  },
});
console.log('committed; waiting for Apple to take the upload');

for (let i = 0; i < 60; i++) {
  const state = (await api('GET', `/v1/buildUploads/${uploadId}`)).data.attributes.state;
  console.log(new Date().toISOString(), state.state, state.errors?.length ? JSON.stringify(state.errors) : '');
  if (state.state === 'COMPLETE') process.exit(0);
  if (state.state === 'FAILED') process.exit(1);
  await new Promise((r) => setTimeout(r, 10000));
}
console.error('still not complete after 10 minutes');
process.exit(1);
