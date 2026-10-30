// The footer on every page of a printed list, to the house standard: the job, the list and the day
// on the left, the page on the right, in the house font at 10.55 inches down the page. Added after
// the page is laid out, since the phone's page maker cannot number pages itself.

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';

/** Points from the bottom of a US Letter page: 11 inches less 10.55, at 72 points to the inch. */
const FOOTER_Y = (11 - 10.55) * 72;
const MARGIN = 54;
const SIZE = 7.5;
const BLUE = rgb(0x4e / 255, 0x7a / 255, 0x8c / 255);

export async function stampFooter(pdfBytes: Uint8Array, text: string, fontBytes: Uint8Array | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  pdf.registerFontkit(fontkit);
  const font = fontBytes ? await pdf.embedFont(fontBytes, { subset: true }) : await pdf.embedFont('Helvetica');
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const label = `Page ${i + 1} of ${pages.length}`;
    const labelWidth = font.widthOfTextAtSize(label, SIZE);
    // Keep the left side clear of the page number on a long title.
    let left = text;
    while (left.length > 8 && font.widthOfTextAtSize(left, SIZE) > width - MARGIN * 2 - labelWidth - 24) left = `${left.slice(0, -2)}…`;
    page.drawText(left, { x: MARGIN, y: FOOTER_Y, size: SIZE, font, color: BLUE });
    page.drawText(label, { x: width - MARGIN - labelWidth, y: FOOTER_Y, size: SIZE, font, color: BLUE });
  });
  return pdf.save();
}
