// iPhone: a sheet, menu, action sheet or full screen photo can only open once the last one has
// finished sliding away. Asked any sooner, iOS does not show it at all, and the button seems to do
// nothing. Each of the app's own sheets reports here while it is on its way down, and
// afterSheets(next) runs next as soon as none is: a picker that leads to another picker, a menu
// choice that opens a sheet. A sheet that stays open (one a picker was opened from) does not hold
// anything up.

import { useCallback, useLayoutEffect, useRef } from 'react';

let closing = 0;
let waiting: (() => void)[] = [];

function settled(): void {
  closing = Math.max(0, closing - 1);
  if (closing > 0 || waiting.length === 0) return;
  const run = waiting;
  waiting = [];
  for (const next of run) next();
}

/**
 * Runs next once no sheet, menu or photo of the app's own is still sliding away. Called as one
 * closes, it waits for that one: the check comes after the screen has been updated.
 */
export function afterSheets(next: () => void): void {
  setTimeout(() => {
    if (closing === 0) next();
    else waiting.push(next);
  }, 0);
}

/** iOS reports a sheet gone when it has finished sliding away; this is the longest to wait for that. */
const LONGEST_CLOSE = 900;
/** A sheet taken off the screen while up slides away in about this long. */
const UNMOUNT_CLOSE = 500;

interface Presence {
  phase: 'gone' | 'up' | 'closing';
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Tracks one sheet for afterSheets. Give the Modal the returned function as its onDismiss: iOS
 * calls it once the sheet is all the way down. A sheet swiped away is already down by the time it
 * closes, and iOS may not call it then, so it also counts as gone a moment after it closes.
 * closeTime: how long it takes to slide away when nothing reports it (the preview page).
 */
export function useSheetPresence(visible: boolean, closeTime = LONGEST_CLOSE): () => void {
  const presence = useRef<Presence>({ phase: 'gone', timer: null });

  const finish = useCallback(() => {
    const p = presence.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    if (p.phase !== 'closing') return;
    p.phase = 'gone';
    settled();
  }, []);

  // A layout effect, so the sheet counts as closing before afterSheets looks.
  useLayoutEffect(() => {
    const p = presence.current;
    if (visible) {
      if (p.phase === 'closing') {
        if (p.timer) clearTimeout(p.timer);
        p.timer = null;
        settled();
      }
      p.phase = 'up';
    } else if (p.phase === 'up') {
      p.phase = 'closing';
      closing += 1;
      p.timer = setTimeout(finish, closeTime);
    }
  }, [visible, finish, closeTime]);

  // Taken off the screen while up or closing: iOS still slides it away, and nothing reports when.
  useLayoutEffect(() => {
    const p = presence.current;
    return () => {
      if (p.timer) clearTimeout(p.timer);
      p.timer = null;
      if (p.phase === 'up') closing += 1;
      if (p.phase !== 'gone') setTimeout(settled, UNMOUNT_CLOSE);
      p.phase = 'gone';
    };
  }, []);

  return finish;
}
