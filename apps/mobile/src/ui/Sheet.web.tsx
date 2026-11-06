// Preview page: the sheet drawn in HTML so it slides on the page's own compositor, like iOS. The
// screen behind shrinks back and dims while it is open. Tap the dimmed area or Cancel to close;
// with changes not saved yet, either asks first, as on the iPhone.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';
import type { BarButtonProps } from './BarButton';
import { askToDiscard } from './discard';
import { useFeedback } from './Feedback';
import { useSheetPresence } from './presence';
import { SheetHeader } from './SheetHeader';
import type { SheetProps } from './Sheet';

export type { SheetProps } from './Sheet';

/** How long the slide down takes. */
const CLOSE_MS = 320;

let openSheets = 0;
function markOpen(open: boolean): void {
  openSheets = Math.max(0, openSheets + (open ? 1 : -1));
  document.body.classList.toggle('pl-sheet-open', openSheets > 0);
}

export function Sheet({ visible, onClose, title, left, right, children, testID, dirty = false, what }: SheetProps) {
  const feedback = useFeedback();
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  useSheetPresence(visible, CLOSE_MS);
  // Mount as soon as it is asked for; unmount only after the slide down has played.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => setMounted(false), CLOSE_MS);
      return () => clearTimeout(t);
    }
    markOpen(true);
    // Two frames: the sheet first renders below the screen, then slides up.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      markOpen(false);
      setShown(false);
    };
  }, [visible]);

  const requestClose = () => (dirty ? askToDiscard(feedback, onClose, what) : onClose());
  const guard = (button?: BarButtonProps) => (button && button.onPress === onClose ? { ...button, onPress: requestClose } : button);

  if (!mounted) return null;
  return createPortal(
    <div className="pl-sheet-root" data-open={shown ? 'true' : 'false'}>
      <div className="pl-sheet-dim" onClick={requestClose} />
      <div className="pl-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testID}>
        <View style={{ flex: 1, minHeight: 0 }}>
          <SheetHeader title={title} left={guard(left)} right={guard(right)} />
          {children}
        </View>
      </div>
    </div>,
    document.body,
  );
}
