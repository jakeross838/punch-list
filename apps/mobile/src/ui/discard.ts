// Asking before unsaved changes are thrown away, the way Apple's own sheets do: Discard Changes in
// red, and Keep Editing to go back to the form.

import { usePreventRemove } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useFeedback } from './Feedback';

type FeedbackApi = ReturnType<typeof useFeedback>;

/** Asks, then runs discard if they say so. what: "this job", for "Your changes to this job will be lost." */
export function askToDiscard(feedback: FeedbackApi, discard: () => void, what?: string): void {
  feedback.actionSheet({
    message: what ? `Your changes to ${what} will be lost.` : 'Your changes will be lost.',
    actions: [{ label: 'Discard Changes', destructive: true, onPress: discard }],
    cancelLabel: 'Keep Editing',
  });
}

/** Leaves at once when nothing changed; otherwise asks first. For screens that cannot be swiped away, like the camera. */
export function leaveOrConfirm(dirty: boolean, feedback: FeedbackApi, leave: () => void, what = 'this item'): void {
  if (!dirty) leave();
  else askToDiscard(feedback, leave, what);
}

/**
 * For a screen with a form, shown as a sheet or pushed: while there are unsaved changes, a swipe
 * down, a swipe back, Back or Cancel asks before leaving. onDiscard runs when they say Discard
 * Changes, before the screen goes. Returns allow: call it before leaving on purpose, after a save.
 */
export function useLeaveGuard(dirty: boolean, what: string, onDiscard?: () => void): () => void {
  const feedback = useFeedback();
  return usePreventRemove(dirty, ({ repeat }) =>
    askToDiscard(
      feedback,
      () => {
        onDiscard?.();
        repeat();
      },
      what,
    ),
  );
}

/**
 * For fields that save when they are left: saves what is still typed when the screen goes. Back or
 * a swipe back can take the screen away before the field hears it was left. save should only write
 * what changed.
 */
export function useSaveOnLeave(save: () => void): void {
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  });
  useEffect(() => {
    const last = latest;
    return () => last.current();
  }, []);
}
