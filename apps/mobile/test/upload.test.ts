// How the phone's changes go up after a long time with no signal: new rows of one table together.

import { describe, expect, it } from 'vitest';
import { RUN_MOST, uploadRuns } from '../src/data/rows';

const put = (table: string, id: string) => ({ op: 'PUT', table, id });
const patch = (table: string, id: string) => ({ op: 'PATCH', table, id });

describe('Changes going up', () => {
  it('puts new rows of the same table that come one after another together, and keeps the order', () => {
    const changes = [put('items', 'a'), put('items', 'b'), put('photos', 'p'), put('photos', 'q'), patch('items', 'a'), put('items', 'c'), { op: 'DELETE', table: 'job_team', id: 't' }];
    const runs = uploadRuns(changes);
    expect(runs.map((r) => r.map((c) => c.id))).toEqual([['a', 'b'], ['p', 'q'], ['a'], ['c'], ['t']]);
    expect(runs.flat()).toEqual(changes);
  });

  it('never sends a change to a row together with others', () => {
    const runs = uploadRuns([patch('items', 'a'), patch('items', 'b')]);
    expect(runs).toHaveLength(2);
  });

  it('sends a week of photos in a few requests, not thousands', () => {
    const changes = Array.from({ length: 3000 }, (_, i) => put('photos', `p${i}`));
    const runs = uploadRuns(changes);
    expect(runs).toHaveLength(3000 / RUN_MOST);
    expect(runs.every((r) => r.length === RUN_MOST)).toBe(true);
  });
});
