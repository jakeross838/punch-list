// The New Item form as each person sets it up in Item Form: which fields show and what a new item
// starts as. Title and location always show. A hidden field still gets its starting value, so a form
// without Ready makes ready items, and the rules still hold on every save.

import { featureOn } from './features';
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
  added_scope: 'Extra work, to be quoted. It goes ahead once it has its purchase order, variance purchase order or change order.',
};

export const FORM_FIELDS: { field: FormField; label: string }[] = [
  { field: 'description', label: 'Description' },
  // A company or someone on the team: one field, saved as company or assignedTo.
  { field: 'company', label: 'Assigned To' },
  { field: 'kind', label: 'Type' },
  { field: 'ready', label: 'Ready' },
  { field: 'waitingOn', label: 'Waiting On' },
];

/** The fields a person can switch on and off in Item Form: Type only while types are on. */
export function formFields(): { field: FormField; label: string }[] {
  return FORM_FIELDS.filter((f) => f.field !== 'kind' || featureOn('types'));
}

export function formShows(settings: FormSettings, field: FormField): boolean {
  if (field === 'kind' && !featureOn('types')) return false;
  return !settings.hidden.includes(field);
}

/** What a new item starts as: the type picked in Item Form, or plain Incomplete while types are off. */
export function startKind(settings: FormSettings): ItemKind {
  return featureOn('types') ? settings.startKind : 'completion';
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
