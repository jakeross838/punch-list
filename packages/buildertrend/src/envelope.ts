import type { BtResponse } from './transport.js';

export interface FailedField {
  key: string;
  message: string;
}

/**
 * Buildertrend reports validation failures in data.failedFields, often with HTTP 200 and
 * success: true. A status code alone never proves a write landed.
 */
export function failedFields(data: unknown): FailedField[] | null {
  if (!isRecord(data)) return null;
  const inner = isRecord(data.data) ? data.data : data;
  const list = inner.failedFields;
  if (Array.isArray(list) && list.length > 0) {
    return list.map((f) => ({
      key: String(isRecord(f) ? f.key ?? '' : f),
      message: String(isRecord(f) ? f.message ?? '' : ''),
    }));
  }
  return null;
}

export function sessionExpired(res: BtResponse): boolean {
  if (res.status === 401 || res.status === 403) return true;
  return isRecord(res.data) && res.data.needsToRelogin === true;
}

export class BtError extends Error {
  constructor(
    message: string,
    readonly response?: BtResponse,
  ) {
    super(message);
    this.name = 'BtError';
  }
}

/** Throws unless the call returned 2xx with no failed fields and no success: false. */
export function ensureOk(res: BtResponse, what: string): void {
  if (sessionExpired(res)) {
    throw new BtError(`${what}: the Buildertrend session has expired; log in again`, res);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new BtError(`${what}: HTTP ${res.status} ${shortText(res.text)}`, res);
  }
  const failed = failedFields(res.data);
  if (failed) {
    throw new BtError(`${what}: ${failed.map((f) => `${f.key} ${f.message}`).join('; ')}`, res);
  }
  if (isRecord(res.data) && res.data.success === false) {
    throw new BtError(`${what}: success false ${shortText(res.text)}`, res);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shortText(text: string): string {
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
