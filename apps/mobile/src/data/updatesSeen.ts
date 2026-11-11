// When Updates was last looked at, on this phone: what came in since then is new, and its count
// shows in Me, on the Updates row. Your own changes are never new to you.

import type { JobLine } from '@/components/ActivityRow';
import { kept } from './kept';

export const updatesSeen = kept('punch.updatesSeen');

/** The lines that came in since Updates was last looked at, not counting your own. */
export function newLines(lines: JobLine[], seenAt: string | null, meId: string | null): JobLine[] {
  return lines.filter((l) => (!seenAt || l.line.at > seenAt) && (!meId || l.line.personId !== meId));
}
