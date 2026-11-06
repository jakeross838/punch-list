// The scan code on a company's list: its page's link as a QR code, drawn as one small SVG that
// scales to its box, with a quiet edge so any phone camera reads it off the paper.

import qrcode from 'qrcode-generator';

/** Modules of white around the code: phone cameras need a clear edge to find it. */
const EDGE = 2;

export function scanCode(url: string): string | null {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    // Each row's dark runs as one rectangle, to keep the page small.
    const runs: string[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; ) {
        if (!qr.isDark(y, x)) {
          x += 1;
          continue;
        }
        let end = x;
        while (end < n && qr.isDark(y, end)) end += 1;
        runs.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
        x = end;
      }
    }
    const size = n + EDGE * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-EDGE} ${-EDGE} ${size} ${size}" shape-rendering="crispEdges"><rect x="${-EDGE}" y="${-EDGE}" width="${size}" height="${size}" fill="#FFFFFF"/><path fill="#1D1D1F" d="${runs.join('')}"/></svg>`;
  } catch {
    return null;
  }
}
