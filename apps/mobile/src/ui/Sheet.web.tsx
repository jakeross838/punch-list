// Preview page: the sheet drawn in HTML so it slides on the page's own compositor, like iOS. The
// screen behind shrinks back and dims while it is open. Tap the dimmed area or Cancel to close.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';
import { SheetHeader } from './SheetHeader';
import type { SheetProps } from './Sheet';

export type { SheetProps } from './Sheet';

let openSheets = 0;
function markOpen(open: boolean): void {
  openSheets = Math.max(0, openSheets + (open ? 1 : -1));
  document.body.classList.toggle('pl-sheet-open', openSheets > 0);
}

export function Sheet({ visible, onClose, title, left, right, children, testID }: SheetProps) {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  // Mount as soon as it is asked for; unmount only after the slide down has played.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => setMounted(false), 320);
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

  if (!mounted) return null;
  return createPortal(
    <div className="pl-sheet-root" data-open={shown ? 'true' : 'false'}>
      <div className="pl-sheet-dim" onClick={onClose} />
      <div className="pl-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testID}>
        <View style={{ flex: 1, minHeight: 0 }}>
          <SheetHeader title={title} left={left} right={right} />
          {children}
        </View>
      </div>
    </div>,
    document.body,
  );
}
