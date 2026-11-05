/// <reference types="node" />
// The large title screens the iPhone stack sets up front (constants/largeTitles.ts) are exactly the
// screens whose Page is large, with the same fixed titles. A large Page left off the list would get its
// large title late, and iOS would draw it over the first rows.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LARGE_TITLES } from '../src/constants/largeTitles';

const APP = join(__dirname, '../src/app');

function screens(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return screens(path);
    return /\.tsx$/.test(name) && !name.startsWith('_') && !/\.web\.tsx$/.test(name) ? [path] : [];
  });
}

/** Every `<Page ...>` opening tag in the file, braces counted so `a > b` inside a prop does not end it. */
function pageTags(source: string): string[] {
  const tags: string[] = [];
  let at = source.indexOf('<Page');
  while (at !== -1) {
    let depth = 0;
    let end = at;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(source.slice(at, end + 1));
    at = source.indexOf('<Page', end);
  }
  return tags.filter((tag) => /^<Page[\s>]/.test(tag));
}

/** The tag with everything inside braces taken out: only the Page's own attributes are left. */
function ownAttributes(tag: string): string {
  let depth = 0;
  let out = '';
  for (const ch of tag) {
    if (ch === '{') depth++;
    if (depth === 0) out += ch;
    if (ch === '}') depth--;
  }
  return out;
}

// Each screen with a large Page, and its fixed title: null when any of its large Pages names itself
// (a screen can have more than one Page, like a job's screen and its No Results page).
const found = new Map<string, string | null>();
for (const file of screens(APP)) {
  const route = relative(APP, file).replace(/\.tsx$/, '').split('\\').join('/');
  const titles = pageTags(readFileSync(file, 'utf8'))
    .map(ownAttributes)
    .filter((tag) => /\slarge(?=[\s/>]|=\{\})/.test(tag))
    .map((tag) => /\stitle="([^"]*)"/.exec(tag)?.[1] ?? null);
  if (titles.length === 0) continue;
  found.set(route, titles.every((t) => t !== null && t === titles[0]) ? titles[0] : null);
}

describe('large titles', () => {
  it('lists every screen whose Page is large, and no other', () => {
    expect([...found.keys()].sort()).toEqual(Object.keys(LARGE_TITLES).sort());
  });

  it('opens each fixed title screen with its own title', () => {
    for (const [route, title] of found) {
      const listed = LARGE_TITLES[route as keyof typeof LARGE_TITLES];
      if (title === null) expect(listed, route).toBe('');
      else expect(listed, route).toBe(title);
    }
  });
});
