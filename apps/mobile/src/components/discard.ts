import type { useFeedback } from '@/ui';

/** Leaves at once when nothing changed; otherwise asks first, the way iOS sheets do. */
export function leaveOrConfirm(dirty: boolean, feedback: ReturnType<typeof useFeedback>, leave: () => void, what = 'this item'): void {
  if (!dirty) {
    leave();
    return;
  }
  feedback.actionSheet({
    message: `Your changes to ${what} will be lost.`,
    actions: [{ label: 'Discard Changes', destructive: true, onPress: leave }],
    cancelLabel: 'Keep Editing',
  });
}
