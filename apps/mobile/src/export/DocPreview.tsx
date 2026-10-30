// iPhone: a list is looked over as the PDF itself, in the phone's own viewer (see printing.ts), so
// there is nothing to draw here. The preview page draws the list on the page (DocPreview.web.tsx).

import type { Printout } from '@punch/core';

export function DocPreview(_props: { printout: Printout; fontCss: string }) {
  return null;
}
