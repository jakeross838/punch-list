// Preview page only: page-wide rules that make the web page behave like an iPhone app. No tap
// flash, no text selection on long press, no double-tap zoom, no scrollbars, and the styles for
// the parts drawn straight in HTML (sheets, swipe rows, the action sheet).
//
// The page itself never scrolls: each screen's list scrolls inside it. The body height is pinned
// because the web stack's mobile browser fix would otherwise size it from a zoomed-out viewport
// while a screen slides in from the right.

const SHEET_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const FONT = 'Inter_400Regular, Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Roboto, sans-serif';
const MONO = 'JetBrainsMono_500Medium, "JetBrains Mono", ui-monospace, Menlo, monospace';

const css = `
html, body { background: #132028; height: 100% !important; overflow: hidden; overscroll-behavior: none; }
body {
  margin: 0;
  font-family: ${FONT};
  -webkit-font-smoothing: antialiased;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}
* { -webkit-tap-highlight-color: transparent; scrollbar-width: none; }
*::-webkit-scrollbar { display: none; }
input, textarea { -webkit-user-select: text; user-select: text; font-family: ${FONT}; }
input:focus, textarea:focus, input:focus-visible, textarea:focus-visible { outline: none; }
#root {
  position: relative;
  overflow: hidden;
  background: #132028;
  transform-origin: 50% 0;
  transition: transform 480ms ${SHEET_CURVE}, border-radius 480ms ${SHEET_CURVE};
}
body.pl-sheet-open #root {
  transform: scale(0.94) translateY(14px);
  overflow: hidden;
}

.pl-sheet-root { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; justify-content: flex-end; }
.pl-sheet-dim { position: absolute; inset: 0; background: rgba(19, 32, 40, 0.45); opacity: 0; transition: opacity 420ms ${SHEET_CURVE}; }
.pl-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100% - 46px);
  background: #F7F5EC;
  border-top: 1px solid rgba(59, 88, 100, 0.15);
  box-shadow: 0 -10px 40px rgba(19, 32, 40, 0.18);
  overflow: hidden;
  transform: translateY(100%);
  transition: transform 300ms ${SHEET_CURVE};
}
.pl-sheet-root[data-open="true"] .pl-sheet-dim { opacity: 1; }
.pl-sheet-root[data-open="true"] .pl-sheet { transform: translateY(0); transition-duration: 480ms; }

.pl-swipe {
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}
.pl-swipe-main { flex: 0 0 100%; min-width: 100%; scroll-snap-align: start; position: relative; display: flex; flex-direction: column; }
.pl-swipe-actions { flex: 0 0 auto; display: flex; scroll-snap-align: end; }
.pl-swipe-action {
  width: 78px; border: 0; padding: 0; margin: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  color: #fff; font: 600 10px ${MONO}; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer;
}
.pl-swipe-action:active { filter: brightness(0.9); }

.pl-action-root { position: fixed; inset: 0; z-index: 1200; display: flex; flex-direction: column; justify-content: flex-end; }
.pl-action-dim { position: absolute; inset: 0; background: rgba(19, 32, 40, 0.45); opacity: 0; transition: opacity 300ms ${SHEET_CURVE}; }
.pl-action-panel {
  position: relative; padding: 0 8px calc(8px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px;
  transform: translateY(110%); transition: transform 300ms ${SHEET_CURVE};
}
.pl-action-root[data-open="true"] .pl-action-dim { opacity: 1; }
.pl-action-root[data-open="true"] .pl-action-panel { transform: translateY(0); transition-duration: 440ms; }
.pl-action-group {
  background: #FFFFFF;
  border: 1px solid rgba(59, 88, 100, 0.15);
  overflow: hidden;
}
.pl-action-head { padding: 14px 16px 12px; text-align: center; }
.pl-action-title { font: 500 10px ${MONO}; letter-spacing: 0.16em; text-transform: uppercase; color: #56707B; }
.pl-action-message { font: 400 13px ${FONT}; color: #56707B; margin-top: 4px; }
.pl-action-button {
  display: block; width: 100%; height: 57px; border: 0; background: transparent;
  font: 500 12px ${MONO}; letter-spacing: 0.14em; text-transform: uppercase; color: #3B5864; cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(59, 88, 100, 0.12);
}
.pl-action-button:active { background: rgba(59, 88, 100, 0.07); }
.pl-action-button[data-destructive="true"] { color: #B0554E; }
.pl-action-cancel { font-weight: 600; box-shadow: none; background: #fff; }

.pl-date { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; padding: 0; margin: 0; font-size: 16px; cursor: pointer; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('pl-web-setup')) {
  const style = document.createElement('style');
  style.id = 'pl-web-setup';
  style.textContent = css;
  document.head.appendChild(style);
}

export {};
