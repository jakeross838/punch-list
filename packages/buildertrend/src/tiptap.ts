// Buildertrend task descriptions are TipTap documents, mirrored in descriptionPlainText.
// The two must be written together and kept consistent.

export interface TipTapText {
  type: 'text';
  text: string;
}

export interface TipTapNode {
  type: string;
  content?: Array<TipTapNode | TipTapText>;
  attrs?: Record<string, unknown>;
  text?: string;
}

export interface TipTapDoc {
  schemaVersion: '1.0.0';
  content: { type: 'doc'; content: TipTapNode[] };
}

/** Plain text to a TipTap doc: one paragraph per line. Empty text means no description. */
export function toTipTap(text: string): TipTapDoc | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.every((l) => l.trim() === '')) return null;
  return {
    schemaVersion: '1.0.0',
    content: {
      type: 'doc',
      content: lines.map((line) =>
        line === ''
          ? { type: 'paragraph' }
          : { type: 'paragraph', content: [{ type: 'text', text: line }] },
      ),
    },
  };
}

/** TipTap doc (or its JSON string) back to plain text, one line per block. */
export function fromTipTap(doc: unknown): string {
  const parsed = typeof doc === 'string' ? safeParse(doc) : doc;
  if (!parsed || typeof parsed !== 'object') return '';
  const root = (parsed as { content?: unknown }).content;
  const blocks = isNode(root) ? root.content ?? [] : Array.isArray(root) ? root : [];
  return blocks.map((b) => textOf(b)).join('\n').trim();
}

function textOf(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as TipTapNode;
  if (typeof n.text === 'string') return n.text;
  return (n.content ?? []).map((c) => textOf(c)).join('');
}

function isNode(value: unknown): value is TipTapNode {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
