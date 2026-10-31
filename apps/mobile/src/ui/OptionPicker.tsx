// Choosing one of a list, the Settings way: a sheet of rows with a checkmark on the current one,
// grouped (rooms by floor), with search when the list is long. A tap picks and closes.

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { layout } from '@/constants/theme';
import { haptic } from './haptics';
import { EmptyState, ListRow, ListSection } from './List';
import { SearchField } from './SearchField';
import { Sheet } from './Sheet';

export interface Option {
  value: string;
  label: string;
  hint?: string | null;
  group?: string;
}

const SEARCH_FROM = 9;

export function OptionPicker({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  footer,
  search,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  value: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  footer?: string;
  /** Search the choices: on by default for a long list. */
  search?: boolean;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? options : options.filter((o) => `${o.label} ${o.hint ?? ''} ${o.group ?? ''}`.toLowerCase().includes(q));
  }, [options, query]);
  const groups = useMemo(() => {
    const out: { name: string; options: Option[] }[] = [];
    for (const o of shown) {
      const name = o.group ?? '';
      const last = out[out.length - 1];
      if (last && last.name === name) last.options.push(o);
      else out.push({ name, options: [o] });
    }
    return out;
  }, [shown]);

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={close} title={title} left={{ label: 'Cancel', onPress: close, testID: 'picker-cancel' }} testID="picker">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} style={{ flex: 1 }}>
        {(search ?? options.length >= SEARCH_FROM) ? (
          <View style={styles.search}>
            <SearchField value={query} onChangeText={setQuery} />
          </View>
        ) : null}
        {groups.map((g, gi) => (
          <ListSection key={`${g.name}-${gi}`} header={g.name || undefined} footer={gi === groups.length - 1 ? footer : undefined}>
            {g.options.map((o) => (
              <ListRow
                key={o.value}
                title={o.label}
                subtitle={o.hint ?? undefined}
                accessory={o.value === value ? 'checkmark' : 'none'}
                accessibilityLabel={o.label}
                onPress={() => {
                  haptic.selection();
                  onSelect(o.value);
                  close();
                }}
              />
            ))}
          </ListSection>
        ))}
        {shown.length === 0 ? <EmptyState icon="magnifyingglass" title="No Results" message={`Nothing matches “${query}”.`} /> : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 48 },
  search: { paddingHorizontal: layout.margin, paddingBottom: 16 },
});
