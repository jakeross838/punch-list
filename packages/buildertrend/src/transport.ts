// One request shape for every place the client runs:
// - in the Chrome extension, through the page's own logged-in session (fetchTransport)
// - in development, through a pasted session cookie and curl (tools/curl-transport.ts)

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface BtResponse {
  status: number;
  data: unknown;
  text: string;
}

export interface Transport {
  request(method: Method, path: string, body?: unknown): Promise<BtResponse>;
}

/**
 * Buildertrend's golden rule: /apix routes take merge-patch JSON, legacy /api routes take plain JSON.
 * The wrong one fails silently or with an opaque 500.
 */
export function contentTypeFor(path: string): string {
  return path.startsWith('/apix/') ? 'application/merge-patch+json' : 'application/json';
}

export function parseBody(text: string): unknown {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Runs inside a buildertrend.net page, so cookies, origin and referer are the page's own. */
export function fetchTransport(base = ''): Transport {
  return {
    async request(method, path, body) {
      const headers: Record<string, string> = {
        accept: 'application/json, text/plain, */*',
        portaltype: '1',
      };
      const init: RequestInit = { method, credentials: 'include', headers };
      if (body !== undefined) {
        headers['content-type'] = contentTypeFor(path);
        init.body = JSON.stringify(body);
      }
      const res = await fetch(base + path, init);
      const text = await res.text();
      return { status: res.status, data: parseBody(text), text };
    },
  };
}

/** Wraps a transport and records every call, for the Phase 0 report. */
export interface CallRecord {
  at: string;
  method: Method;
  path: string;
  body?: unknown;
  status: number;
  ms: number;
  response: unknown;
}

export function recordingTransport(inner: Transport, log: CallRecord[], keepResponses = false): Transport {
  return {
    async request(method, path, body) {
      const started = Date.now();
      const res = await inner.request(method, path, body);
      log.push({
        at: new Date(started).toISOString(),
        method,
        path,
        body,
        status: res.status,
        ms: Date.now() - started,
        response: keepResponses ? res.data : summarize(res.data),
      });
      return res;
    },
  };
}

function summarize(data: unknown): unknown {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  if (text === undefined) return null;
  return text.length > 600 ? `${text.slice(0, 600)}… (${text.length} characters)` : data;
}
