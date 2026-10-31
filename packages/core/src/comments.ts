// Comments: a back and forth on an item, or on a company's whole list on a job, between Ross Built
// and the company doing the work. Ross Built writes from the app; the company writes from the
// private page its list links to, under the name it types. A comment marked Ross Built only stays
// inside Ross Built: never on the company's page or a printed list.

import type { Comment } from './types';

export const COMMENT_MAX = 2000;
export const NAME_MAX = 80;

/** A comment tidied: trimmed, no runs of blank lines, never longer than COMMENT_MAX. */
export function tidyComment(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, COMMENT_MAX);
}

/** A name typed on the company's page, tidied: single spaces, never longer than NAME_MAX, or null. */
export function tidyName(text: string | null | undefined): string | null {
  const t = (text ?? '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  return t === '' ? null : t;
}

/** Shown to the company: not Ross Built only, and not taken back. */
export const isShared = (c: Pick<Comment, 'internal' | 'removed'>) => !c.internal && !c.removed;

const oldestFirst = (a: Comment, b: Comment) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** An item's comments, oldest first. shared: only what the company sees. */
export function itemComments(comments: Comment[], itemId: string, options: { shared?: boolean } = {}): Comment[] {
  return comments.filter((c) => c.itemId === itemId && !c.removed && (!options.shared || !c.internal)).sort(oldestFirst);
}

/** The comments on a company's whole list on the job, oldest first. */
export function listComments(comments: Comment[], companyId: string, options: { shared?: boolean } = {}): Comment[] {
  return comments.filter((c) => c.itemId === null && c.companyId === companyId && !c.removed && (!options.shared || !c.internal)).sort(oldestFirst);
}

/** How many comments each item has, Ross Built only ones included. */
export function commentCounts(comments: Comment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of comments) if (c.itemId && !c.removed) out.set(c.itemId, (out.get(c.itemId) ?? 0) + 1);
  return out;
}

/** Who wrote it, as it reads: "Jake Ross", "Mike at SMS Carpentry", "SMS Carpentry". */
export function commentAuthor(c: Pick<Comment, 'fromCompany' | 'authorName' | 'personId' | 'companyId'>, look: { people: Map<string, string>; companies: Map<string, string> }): string {
  if (!c.fromCompany) return look.people.get(c.personId ?? '') ?? 'Ross Built';
  const company = look.companies.get(c.companyId ?? '') ?? 'The company';
  return c.authorName ? `${c.authorName} at ${company}` : company;
}

/** "3 comments", "1 comment". */
export const commentCountText = (n: number) => `${n} ${n === 1 ? 'comment' : 'comments'}`;
