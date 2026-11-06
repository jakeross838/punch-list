// Choosing one of a list, the Settings way: a sheet of rows with a checkmark on the current one,
// grouped (rooms by floor), and a search at the top of every list. Typing narrows it as you go,
// the closest names first: "gat" finds Gator Plumbing, "master bath" finds Master Bathroom 207.
// On a long list the search is ready to type straight away, and the search key picks the first
// match. A tap picks and closes. A list that can grow (locations, companies) adds what was typed
// when nothing has that name: Add "Kitchen 109" at the top, or the search key.

import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { layout } from '@/constants/theme';
import { useFeedback } from './Feedback';
import { haptic } from './haptics';
import { EmptyState, ListRow, ListSection } from './List';
import { SearchField } from './SearchField';
import { Sheet } from './Sheet';
import { SheetScroll } from './SheetScroll';

export interface Option {
  value: string;
  label: string;
  hint?: string | null;
  group?: string;
}

/** From this many choices on, the search is ready to type when the list opens. */
const TYPE_FROM = 9;

/** How closely a choice fits what was typed: 0 its name starts with it, 1 a word in its name does, 2 it is in there; null not at all. */
export function matchRank(option: Option, query: string): number | null {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 2;
  const label = option.label.toLowerCase();
  const all = `${label} ${option.hint ?? ''} ${option.group ?? ''}`.toLowerCase();
  if (!words.every((w) => all.includes(w))) return null;
  const typed = words.join(' ');
  if (label.startsWith(typed)) return 0;
  if (label.split(/[\s,/()-]+/).some((w) => w.startsWith(words[0]!))) return 1;
  return 2;
}

export function OptionPicker({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  footer,
  search = true,
  typeFirst,
  add,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  value: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  footer?: string;
  /** Search the choices: on for every list unless turned off. */
  search?: boolean;
  /** The search ready to type when the list opens: on for a long list unless said otherwise. */
  typeFirst?: boolean;
  /**
   * A list that can grow: what it is called ("Location"), and what adds the typed name. It answers
   * the new choice's value, which is then picked, or null when it was not added (it said why).
   */
  add?: { noun: string; onAdd: (name: string) => Promise<string | null> };
}) {
  const feedback = useFeedback();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const searching = query.trim() !== '';
  // Closed from outside (another sheet comes next): what was typed goes.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) setQuery('');
  }
  const typed = query.trim().replace(/\s+/g, ' ');
  // Add is offered while typing a name nothing on the list has.
  const canAdd = !!add && typed !== '' && !options.some((o) => o.label.trim().toLowerCase() === typed.toLowerCase());
  // While searching: one list, the closest first, each in the order it had.
  const shown = useMemo(() => {
    if (!searching) return options;
    return options
      .map((o, i) => ({ o, i, rank: matchRank(o, query) }))
      .filter((x): x is { o: Option; i: number; rank: number } => x.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.o);
  }, [options, query, searching]);
  const groups = useMemo(() => {
    if (searching) return [{ name: '', options: shown }];
    const out: { name: string; options: Option[] }[] = [];
    for (const o of shown) {
      const name = o.group ?? '';
      const last = out[out.length - 1];
      if (last && last.name === name) last.options.push(o);
      else out.push({ name, options: [o] });
    }
    return out;
  }, [shown, searching]);

  function close() {
    setQuery('');
    onClose();
  }

  function pick(o: Option) {
    haptic.selection();
    onSelect(o.value);
    close();
  }

  async function addTyped() {
    if (!add || !canAdd || adding) return;
    setAdding(true);
    try {
      const value = await add.onAdd(typed);
      if (value) {
        haptic.success();
        onSelect(value);
        close();
      }
    } catch (e) {
      feedback.toast({ message: e instanceof Error && e.message ? e.message : `The ${add.noun.toLowerCase()} was not added. Try again.` });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={title} left={{ label: 'Cancel', onPress: close, testID: 'picker-cancel' }} testID="picker">
      <SheetScroll contentContainerStyle={styles.content} style={{ flex: 1 }}>
        {search ? (
          <View style={styles.search}>
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={add ? `Search or Add a ${add.noun}` : undefined}
              autoFocus={typeFirst ?? (options.length >= TYPE_FROM || (!!add && options.length === 0))}
              onSubmit={() => {
                const exact = shown.find((o) => o.label.trim().toLowerCase() === typed.toLowerCase());
                if (exact) pick(exact);
                else if (canAdd) void addTyped();
                else if (searching && shown[0]) pick(shown[0]);
              }}
              testID="picker-search"
            />
          </View>
        ) : null}
        {canAdd && add ? (
          <ListSection>
            <ListRow
              title={adding ? 'Adding' : `Add “${typed}”`}
              subtitle={`New ${add.noun.toLowerCase()}`}
              icon="plus"
              accessory="none"
              onPress={() => void addTyped()}
              testID="picker-add"
            />
          </ListSection>
        ) : null}
        {add && options.length === 0 && !searching ? (
          <EmptyState icon="plus" title={`No ${add.noun}s Yet`} message={`Type a ${add.noun.toLowerCase()}'s name above to add it.`} />
        ) : null}
        {shown.length > 0
          ? groups.map((g, gi) => (
              <ListSection key={`${g.name}-${gi}`} header={g.name || undefined} footer={gi === groups.length - 1 && !searching ? footer : undefined}>
                {g.options.map((o) => (
                  <ListRow
                    key={o.value}
                    title={o.label}
                    // While searching the groups are gone, so a row says its group when it has nothing else to say.
                    subtitle={o.hint ?? (searching ? o.group : undefined) ?? undefined}
                    accessory={o.value === value ? 'checkmark' : 'none'}
                    accessibilityLabel={o.label}
                    onPress={() => pick(o)}
                  />
                ))}
              </ListSection>
            ))
          : null}
        {shown.length === 0 && searching && !canAdd ? <EmptyState icon="magnifyingglass" title="No Results" message={`Nothing matches “${query.trim()}”.`} /> : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 48 },
  search: { paddingHorizontal: layout.margin, paddingBottom: 16 },
});
