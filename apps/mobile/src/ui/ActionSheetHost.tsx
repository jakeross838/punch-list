// iPhone: action sheets are the system's own (ActionSheetIOS), so there is nothing to draw here.

import type { ActionSheetRequest } from './feedback-types';

export function ActionSheetHost(_: { request: ActionSheetRequest | null; onDone: () => void }) {
  return null;
}
