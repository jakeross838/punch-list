import { isRecord } from './envelope.js';
import type { BtTask } from './tasks.js';

// The definitions shape is documented (customFieldId, label, dataType, options[{id,text,sortOrder}]).
// The shape of a task's customFieldValues entries is NOT documented yet, so reading is tolerant and
// Phase 0 reports the exact shape it finds. Once confirmed, the tolerant paths get tightened.

export interface FieldOption {
  id: number;
  text: string;
  sortOrder: number;
}

export interface FieldDef {
  id: number;
  label: string;
  dataType: string;
  required: boolean;
  onSubPortal: boolean | null;
  tooltip: string;
  options: FieldOption[];
}

export function parseDefinitions(data: unknown): FieldDef[] {
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.definitions)
      ? data.definitions
      : isRecord(data) && Array.isArray(data.data)
        ? data.data
        : [];
  return list.filter(isRecord).map((d) => ({
    id: Number(d.customFieldId ?? d.id),
    label: String(d.label ?? d.name ?? ''),
    dataType: dataTypeName(d.dataType),
    required: d.isRequired === true,
    onSubPortal: typeof d.onSubPortal === 'boolean' ? d.onSubPortal : null,
    tooltip: String(d.tooltipText ?? ''),
    options: Array.isArray(d.options)
      ? d.options.filter(isRecord).map((o) => ({
          id: Number(o.id),
          text: String(o.text ?? o.name ?? ''),
          sortOrder: Number(o.sortOrder ?? 0),
        }))
      : [],
  }));
}

const DATA_TYPES = [
  'Text',
  'MultiLineText',
  'CheckBox',
  'WholeNumber',
  'ListOfUsers',
  'ListOfSubs',
  'Date',
  'Currency',
  'File',
  'DropDownList',
  'DropDownCheckList',
  'Link',
  'MultiSelectUsers',
  'MultiSelectSubs',
];

function dataTypeName(value: unknown): string {
  if (typeof value === 'number') return DATA_TYPES[value] ?? `Type${value}`;
  return String(value ?? '');
}

const ID_KEYS = ['customFieldId', 'fieldId', 'definitionId', 'id'] as const;
const VALUE_KEYS = [
  'value',
  'values',
  'textValue',
  'stringValue',
  'boolValue',
  'booleanValue',
  'checked',
  'dateValue',
  'selectedOptionId',
  'selectedOptionIds',
  'optionId',
  'optionIds',
  'selectedOptions',
  'options',
] as const;

export function entryFieldId(entry: unknown): number | null {
  if (!isRecord(entry)) return null;
  for (const key of ID_KEYS) {
    const v = entry[key];
    if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) return Number(v);
    if (isRecord(v) && (typeof v.id === 'number' || typeof v.customFieldId === 'number')) {
      return Number(v.customFieldId ?? v.id);
    }
  }
  return null;
}

export function fieldEntry(task: BtTask, fieldId: number): Record<string, unknown> | undefined {
  const entries = Array.isArray(task.customFieldValues) ? task.customFieldValues : [];
  return entries.filter(isRecord).find((e) => entryFieldId(e) === fieldId);
}

export interface FieldValue {
  /** Normalized for the app: text, true/false, a YYYY-MM-DD date, or the option's text. */
  value: string | boolean | null;
  /** Which key held the value in Buildertrend's entry, for writing it back in the same shape. */
  valueKey: string | null;
  raw: unknown;
}

export function readFieldValue(entry: Record<string, unknown> | undefined, def: FieldDef | undefined): FieldValue {
  if (!entry) return { value: null, valueKey: null, raw: undefined };
  const valueKey = VALUE_KEYS.find((k) => entry[k] !== undefined && entry[k] !== null) ?? null;
  const raw = valueKey ? entry[valueKey] : undefined;
  return { value: normalize(raw, def), valueKey, raw };
}

function normalize(raw: unknown, def: FieldDef | undefined): string | boolean | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const type = def?.dataType ?? '';
  if (type === 'CheckBox') return raw === true || raw === 'true' || raw === 1 || raw === '1';
  if (type === 'Date') return typeof raw === 'string' ? raw.slice(0, 10) : null;
  if (type === 'DropDownList' || type === 'DropDownCheckList') {
    const ids = optionIds(raw);
    const texts = ids.map((id) => def?.options.find((o) => o.id === id)?.text ?? `option ${id}`);
    if (texts.length > 0) return texts.join(', ');
    return typeof raw === 'string' ? raw : null;
  }
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return JSON.stringify(raw);
}

function optionIds(raw: unknown): number[] {
  if (typeof raw === 'number') return [raw];
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return [Number(raw)];
  if (Array.isArray(raw)) return raw.flatMap((r) => optionIds(r));
  if (isRecord(raw)) {
    if (typeof raw.id === 'number') return [raw.id];
    if (Array.isArray(raw.options)) {
      return raw.options.filter((o) => isRecord(o) && o.selected !== false).flatMap((o) => optionIds(o));
    }
  }
  return [];
}

/** For the Phase 0 report: the distinct entry shapes seen per field, with one example each. */
export function describeValueShapes(tasks: BtTask[]): Record<string, { keys: string; count: number; example: unknown }[]> {
  const out: Record<string, Map<string, { keys: string; count: number; example: unknown }>> = {};
  for (const task of tasks) {
    for (const entry of Array.isArray(task.customFieldValues) ? task.customFieldValues : []) {
      const id = entryFieldId(entry);
      const fieldKey = id === null ? 'unknown' : String(id);
      const keys = isRecord(entry) ? Object.keys(entry).sort().join(',') : typeof entry;
      const byShape = (out[fieldKey] ??= new Map());
      const seen = byShape.get(keys);
      if (seen) seen.count += 1;
      else byShape.set(keys, { keys, count: 1, example: entry });
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.values()]]));
}
