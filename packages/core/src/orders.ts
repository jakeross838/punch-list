// What covers additional work once it is priced: a purchase order to the company, a variance
// purchase order for a cost Ross Built carries, or a change order with the owner, with its number.
// Until it has one, additional work is to be quoted. Kept as one short reference, "CO 14", the way
// Buildertrend writes it, and always said in full on screen and on paper: "Change Order 14".

export type OrderType = 'po' | 'vpo' | 'co';

export const ORDER_TYPES: OrderType[] = ['po', 'vpo', 'co'];

export const ORDER_LABELS: Record<OrderType, string> = {
  po: 'Purchase Order',
  vpo: 'Variance Purchase Order',
  co: 'Change Order',
};

const SHORT: Record<OrderType, string> = { po: 'PO', vpo: 'VPO', co: 'CO' };

const PREFIX =
  /^\s*(variance\s+purchase\s+order|purchase\s+order|change\s+order|v\.?\s?p\.?\s?o\.?|p\.?\s?o\.?|c\.?\s?o\.?)(?![a-z])\s*(?:#|no\.?|number)?\s*[-:#.]?\s*/i;

/** An order reference read back: its type when it says one, and its number. "CO-14" is a change order, 14. */
export function readOrder(text: string | null | undefined): { type: OrderType | null; number: string } {
  const t = (text ?? '').trim();
  const m = PREFIX.exec(t);
  if (!m) return { type: null, number: t };
  const word = m[1]!.toLowerCase().replace(/[\s.]/g, '');
  const type: OrderType = word.startsWith('variance') || word === 'vpo' ? 'vpo' : word.startsWith('purchase') || word === 'po' ? 'po' : 'co';
  return { type, number: t.slice(m[0].length).trim() };
}

/** The reference as it is kept: "CO 14"; null without a number. */
export function writeOrder(type: OrderType | null, number: string): string | null {
  const n = number.trim().replace(/\s+/g, ' ');
  if (n === '') return null;
  return type ? `${SHORT[type]} ${n}` : n;
}

/** The reference in full: "Change Order 14", "Purchase Order 0090". */
export function orderText(text: string | null | undefined): string {
  const { type, number } = readOrder(text);
  if (!type) return number;
  return number ? `${ORDER_LABELS[type]} ${number}` : ORDER_LABELS[type];
}
