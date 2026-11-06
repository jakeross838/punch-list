// Two drawn stand-ins for job photos, for the preview link's sample items only: the range wall in
// a kitchen, with the upper cabinets in and with only their outlines. Drawn, not photographed, so
// nobody mistakes them for the real Fish job.

const WALL = `
<rect width="390" height="520" fill="#D6D1C9"/>
<rect width="390" height="44" fill="#E8E5E0"/>
<rect y="44" width="390" height="5" fill="#CAC4BB"/>
<rect y="236" width="390" height="112" fill="#E2DED8"/>
<path d="M0 258h390M0 280h390M0 302h390M0 324h390M22 236v22M66 236v22M110 236v22M154 236v22M198 236v22M242 236v22M286 236v22M330 236v22M374 236v22M44 258v22M88 258v22M132 258v22M176 258v22M220 258v22M264 258v22M308 258v22M352 258v22M22 280v22M66 280v22M110 280v22M154 280v22M198 280v22M242 280v22M286 280v22M330 280v22M374 280v22M44 302v22M88 302v22M132 302v22M176 302v22M220 302v22M264 302v22M308 302v22M352 302v22M22 324v22M66 324v22M110 324v22M154 324v22M198 324v22M242 324v22M286 324v22M330 324v22M374 324v22" fill="none" stroke="#D3CEC6" stroke-width="1"/>
<path d="M156 49h78l24 163H132z" fill="#C3BEB6"/>
<rect x="128" y="212" width="134" height="14" fill="#AFAAA2"/>`;

const UPPERS = `
<rect x="14" y="56" width="120" height="180" rx="2" fill="#F4F2EE" stroke="#C3BDB3" stroke-width="1.5"/>
<path d="M74 56l2.5 180" stroke="#C3BDB3" stroke-width="1.5"/>
<rect x="64" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="84" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="256" y="56" width="120" height="180" rx="2" fill="#F4F2EE" stroke="#C3BDB3" stroke-width="1.5"/>
<path d="M316 56v180" stroke="#C3BDB3" stroke-width="1.5"/>
<rect x="306" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="323" y="196" width="3.5" height="24" rx="1.75" fill="#8F8980"/>
<rect x="14" y="236" width="120" height="8" fill="#000" opacity="0.05"/>
<rect x="256" y="236" width="120" height="8" fill="#000" opacity="0.05"/>`;

const OUTLINES = `
<rect x="14" y="56" width="120" height="180" fill="none" stroke="#A9A39A" stroke-width="2" stroke-dasharray="8 7"/>
<rect x="256" y="56" width="120" height="180" fill="none" stroke="#A9A39A" stroke-width="2" stroke-dasharray="8 7"/>`;

const BASE = `
<rect y="348" width="390" height="18" fill="#5C5752"/>
<rect y="366" width="390" height="3" fill="#46423E"/>
<rect x="134" y="342" width="122" height="8" rx="2" fill="#2F2D2B"/>
<rect y="369" width="134" height="151" fill="#EEEBE6"/>
<rect x="256" y="369" width="134" height="151" fill="#EEEBE6"/>
<path d="M0 406h134M256 406h134M67 406v114M323 406v114" stroke="#D0CAC1" stroke-width="1.5"/>
<rect x="134" y="369" width="122" height="151" fill="#8D8982"/>
<rect x="146" y="382" width="98" height="5" rx="2.5" fill="#BAB6AF"/>
<rect x="152" y="404" width="86" height="60" rx="4" fill="#3A3836"/>`;

const svg = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 390 520">${body}</svg>`,
  )}`;

export const SAMPLE_PHOTO_SIZE = { width: 1200, height: 1600 };
export const RANGE_WALL = svg(WALL + UPPERS + BASE);
export const RANGE_WALL_NO_UPPERS = svg(WALL + OUTLINES + BASE);

// A drawn stand-in for a level's plan, for the preview's sample job only: Level 1 with its rooms
// named as the sample locations are. Walls in slate, room names in small capitals.
const PLAN = `
<rect width="1600" height="1100" fill="#FBFAF6"/>
<g fill="none" stroke="#3B5864" stroke-width="10" stroke-linejoin="miter">
<rect x="80" y="80" width="1440" height="940"/>
<path d="M620 80v520M620 680v340M1060 80v300M1060 460v560M620 600h440M80 560h420M580 560h40M1060 380h460"/>
</g>
<g fill="none" stroke="#3B5864" stroke-width="4">
<path d="M500 560a80 80 0 0 1 80 0M1060 380a80 80 0 0 0 0 80M620 600a80 80 0 0 0 0 80"/>
</g>
<g fill="#9DAAB0" opacity="0.35">
<rect x="680" y="120" width="320" height="56"/><rect x="940" y="176" width="60" height="260"/><rect x="740" y="300" width="160" height="110"/>
</g>
<g font-family="Menlo, monospace" font-size="30" letter-spacing="5" fill="#56707B">
<text x="130" y="140">LIVING 107</text>
<text x="670" y="250" dx="0">KITCHEN 109</text>
<text x="1110" y="140">GUEST BEDROOM 114</text>
<text x="670" y="660">FOYER 115</text>
<text x="130" y="620">BATHROOM 116</text>
<text x="1110" y="520">LAUNDRY 119</text>
</g>`;

export const SAMPLE_PLAN_SIZE = { width: 1600, height: 1100 };
export const SAMPLE_PLAN = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">${PLAN}</svg>`,
)}`;
