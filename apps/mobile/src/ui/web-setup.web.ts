// Preview page only: page-wide rules that make the web page behave like an iPhone app. No tap
// flash, no text selection on long press, no double-tap zoom, no scrollbars, and the styles for
// the parts drawn straight in HTML (sheets, menus, swipe rows, the action sheet).
//
// The page itself never scrolls: each screen's list scrolls inside it. The body height is pinned
// because the web stack's mobile browser fix would otherwise size it from a zoomed-out viewport
// while a screen slides in from the right.

const SHEET_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Inter, Roboto, sans-serif';

const css = `
html, body { background: #000; height: 100% !important; overflow: hidden; overscroll-behavior: none; }
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
  background: #000;
  transform-origin: 50% 0;
  transition: transform 480ms ${SHEET_CURVE}, border-radius 480ms ${SHEET_CURVE};
}
body.pl-sheet-open #root {
  transform: scale(0.935) translateY(14px);
  border-radius: 18px;
  overflow: hidden;
}

.pl-sheet-root { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; justify-content: flex-end; }
.pl-sheet-dim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.22); opacity: 0; transition: opacity 420ms ${SHEET_CURVE}; }
.pl-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100% - 46px);
  background: #F2F2F7;
  border-radius: 22px 22px 0 0;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.04), 0 -10px 40px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  transform: translateY(100%);
  transition: transform 300ms ${SHEET_CURVE};
}
.pl-sheet-root[data-open="true"] .pl-sheet-dim { opacity: 1; }
.pl-sheet-root[data-open="true"] .pl-sheet { transform: translateY(0); transition-duration: 480ms; }

.pl-menu-root { position: fixed; inset: 0; z-index: 1100; }
.pl-menu {
  position: absolute;
  min-width: 250px;
  max-width: 300px;
  background: rgba(250, 250, 250, 0.9);
  -webkit-backdrop-filter: blur(30px) saturate(190%);
  backdrop-filter: blur(30px) saturate(190%);
  border-radius: 16px;
  box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 10px 40px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transform-origin: top right;
  transform: scale(0.6);
  opacity: 0;
  transition: transform 320ms ${EASE_OUT}, opacity 200ms ${EASE_OUT};
}
.pl-menu-root[data-open="true"] .pl-menu { transform: scale(1); opacity: 1; }
.pl-menu-group + .pl-menu-group { border-top: 8px solid rgba(0, 0, 0, 0.06); }
.pl-menu-title { padding: 10px 16px 4px; font: 400 13px ${FONT}; color: rgba(60, 60, 67, 0.6); }
.pl-menu-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  min-height: 46px; padding: 0 16px; border: 0; background: transparent; text-align: left;
  font: 400 17px ${FONT}; color: #000; cursor: pointer;
}
.pl-menu-item + .pl-menu-item { box-shadow: inset 0 0.5px 0 rgba(60, 60, 67, 0.22); }
.pl-menu-item:active { background: rgba(0, 0, 0, 0.08); }
.pl-menu-item[data-destructive="true"] { color: #FF3B30; }
.pl-menu-check { width: 16px; flex: 0 0 16px; display: flex; }
.pl-menu-label { flex: 1; }

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
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  color: #fff; font: 600 13px ${FONT}; cursor: pointer;
}
.pl-swipe-action:active { filter: brightness(0.9); }

.pl-action-root { position: fixed; inset: 0; z-index: 1200; display: flex; flex-direction: column; justify-content: flex-end; }
.pl-action-dim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.3); opacity: 0; transition: opacity 300ms ${SHEET_CURVE}; }
.pl-action-panel {
  position: relative; padding: 0 8px calc(8px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px;
  transform: translateY(110%); transition: transform 300ms ${SHEET_CURVE};
}
.pl-action-root[data-open="true"] .pl-action-dim { opacity: 1; }
.pl-action-root[data-open="true"] .pl-action-panel { transform: translateY(0); transition-duration: 440ms; }
.pl-action-group {
  background: rgba(250, 250, 250, 0.86);
  -webkit-backdrop-filter: blur(30px) saturate(190%);
  backdrop-filter: blur(30px) saturate(190%);
  border-radius: 16px; overflow: hidden;
}
.pl-action-head { padding: 14px 16px 12px; text-align: center; }
.pl-action-title { font: 600 13px ${FONT}; color: rgba(60, 60, 67, 0.6); }
.pl-action-message { font: 400 13px ${FONT}; color: rgba(60, 60, 67, 0.6); margin-top: 2px; }
.pl-action-button {
  display: block; width: 100%; height: 57px; border: 0; background: transparent;
  font: 400 20px ${FONT}; color: #4E7A8C; cursor: pointer;
  box-shadow: inset 0 0.5px 0 rgba(60, 60, 67, 0.25);
}
.pl-action-button:active { background: rgba(0, 0, 0, 0.08); }
.pl-action-button[data-destructive="true"] { color: #FF3B30; }
.pl-action-cancel { font-weight: 600; box-shadow: none; background: #fff; border-radius: 16px; }

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
