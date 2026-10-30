// Preview page: a printed list shown as a sheet of paper, laid out exactly as the PDF the iPhone
// makes, scaled down to fit the screen.

import { PRINT_CSS, type Printout } from '@punch/core';
import { useWindowDimensions } from 'react-native';

/** A US Letter page at 96 to the inch, and its three quarter inch margin. */
const PAGE = 816;
const MARGIN = 72;

export function DocPreview({ printout, fontCss }: { printout: Printout; fontCss: string }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(1, (Math.min(width, 720) - 32) / PAGE);
  return (
    <div style={{ padding: '6px 16px 32px' }}>
      <style>{`${fontCss}${PRINT_CSS}`}</style>
      <div
        style={{
          width: Math.round(PAGE * scale),
          margin: '0 auto',
          background: '#FFFFFF',
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1), 0 8px 24px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div style={{ boxSizing: 'border-box', width: PAGE, padding: MARGIN, zoom: scale }}>
          <div className="rb-doc" data-testid="doc-preview" dangerouslySetInnerHTML={{ __html: printout.body }} />
        </div>
      </div>
    </div>
  );
}
