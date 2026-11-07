// The pairs of items someone said are not the same work, kept on this phone for each job, so Find
// Duplicates does not ask about them again.

const key = (jobId: string) => `punch.apart.${jobId}`;
const memory = new Map<string, Set<string>>();

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function readApart(jobId: string): Set<string> {
  const kept = memory.get(jobId);
  if (kept) return new Set(kept);
  try {
    const raw = storage()?.getItem(key(jobId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const set = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
    memory.set(jobId, set);
    return new Set(set);
  } catch {
    return new Set();
  }
}

export function addApart(jobId: string, pair: string): void {
  const set = readApart(jobId);
  set.add(pair);
  memory.set(jobId, set);
  try {
    storage()?.setItem(key(jobId), JSON.stringify([...set]));
  } catch {
    // Kept for now, in memory.
  }
}
