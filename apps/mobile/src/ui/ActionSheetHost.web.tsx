// Preview page: the iOS action sheet. Choices on frosted glass, Cancel on its own below.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ActionSheetRequest } from './feedback-types';

export function ActionSheetHost({ request, onDone }: { request: ActionSheetRequest | null; onDone: () => void }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!request) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [request]);

  /** Slides the sheet away, then clears it and runs the choice. */
  function finish(then?: () => void) {
    setShown(false);
    setTimeout(() => {
      onDone();
      then?.();
    }, 260);
  }

  if (!request) return null;
  return createPortal(
    <div className="pl-action-root" data-open={shown ? 'true' : 'false'}>
      <div className="pl-action-dim" onClick={() => finish()} />
      <div className="pl-action-panel" role="dialog" aria-modal="true" aria-label={request.title ?? 'Choose'}>
        <div className="pl-action-group">
          {request.title || request.message ? (
            <div className="pl-action-head">
              {request.title ? <div className="pl-action-title">{request.title}</div> : null}
              {request.message ? <div className="pl-action-message">{request.message}</div> : null}
            </div>
          ) : null}
          {request.actions.map((a, i) => (
            <button
              type="button"
              key={a.label}
              className="pl-action-button"
              style={i === 0 && !request.title && !request.message ? { boxShadow: 'none' } : undefined}
              data-destructive={a.destructive ? 'true' : 'false'}
              onClick={() => finish(a.onPress)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="pl-action-button pl-action-cancel" onClick={() => finish()}>
          {request.cancelLabel ?? 'Cancel'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
