// The New Item form as each person sets it up in Item Form: which fields show and what a new item
// starts as. Title and location always show. A hidden field still gets its starting value, so a form
// without Ready makes ready items, and the rules still hold on every save.

import type { CustomField, ExtraValue, FormField, FormSettings, ItemKind } from './types';

export const DEFAULT_FORM: FormSettings = { hidden: [], startReady: true, startKind: 'completion' };

/** The three types, in the order the form shows them. */
export const KINDS: ItemKind[] = ['deficiency', 'completion', 'added_scope'];

/** Completion is scope completion: the company's own work, not done yet. */
export const KIND_LABELS: Record<ItemKind, string> = { deficiency: 'Deficiency', completion: 'Incomplete', added_scope: 'Additional' };

/** One line under the type on the form. */
export const KIND_HINTS: Record<ItemKind, string> = {
  deficiency: 'Something wrong or damaged to fix.',
  completion: "The company's own work, not finished yet.",
  added_scope: 'Extra work. Add the purchase order or change order number once it is priced.',
};

export const FORM_FIELDS: { field: FormField; label: string }[] = [
  { field: 'description', label: 'Description' },
  { field: 'company', label: 'Company' },
  { field: 'trade', label: 'Trade' },
  { field: 'kind', label: 'Type' },
  { field: 'ready', label: 'Ready' },
  { field: 'waitingOn', label: 'Waiting On' },
  { field: 'readyBy', label: 'Ready By' },
  { field: 'hours', label: 'Estimated Time' },
];

export function formShows(settings: FormSettings, field: FormField): boolean {
  return !settings.hidden.includes(field);
}

export function setFieldShown(settings: FormSettings, field: FormField, shown: boolean): FormSettings {
  const hidden = settings.hidden.filter((f) => f !== field);
  return { ...settings, hidden: shown ? hidden : [...hidden, field] };
}

/** An added field's answer, tidied: trimmed text, a list choice that is on the list, or nothing. */
export function tidyExtra(field: CustomField, value: ExtraValue): ExtraValue {
  if (value === null) return null;
  switch (field.kind) {
    case 'yes_no':
      return typeof value === 'boolean' ? value : null;
    case 'list':
      return typeof value === 'string' && field.options.includes(value) ? value : null;
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    case 'text': {
      const t = typeof value === 'string' ? value.trim() : '';
      return t === '' ? null : t;
    }
  }
}

export function customFieldKindLabel(kind: CustomField['kind']): string {
  return kind === 'yes_no' ? 'Yes or No' : kind === 'list' ? 'Choices' : kind === 'date' ? 'Date' : 'Text';
}
