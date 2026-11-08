// Claude's look at the work: the photo of the problem next to the done photo, and whether the item
// looks done, or what still looks left. Asked once for each pair of photos while the app is open,
// on an open item, and only once Claude is set up. It helps the check; it never completes anything.

import { readDoneCheck, type DoneCheck, type Item, type Photo } from '@punch/core';
import { useEffect, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { askClaude, useClaudeReady } from '@/ai/claude';
import { colors, layout } from '@/constants/theme';
import { Icon, Text } from '@/ui';

type Answer = DoneCheck | 'asking' | 'failed';

/** Claude's answers, by the pair of photos and the marks on the first. */
const answers = new Map<string, Answer>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
function answer(key: string, a: Answer) {
  answers.set(key, a);
  for (const l of listeners) l();
}

/** The photo of the problem (the first that is not a done photo) and the newest done photo. */
export function photoPair(photos: Photo[]): { before: Photo; after: Photo } | null {
  const live = photos.filter((p) => !p.removed).sort((a, b) => a.sortOrder - b.sortOrder);
  const before = live.find((p) => !p.done);
  const after = [...live].reverse().find((p) => p.done);
  return before && after ? { before, after } : null;
}

export function DoneCheckLine({ item, photos, location }: { item: Item; photos: Photo[]; location: string }) {
  const ready = useClaudeReady(true);
  const pair = item.status === 'open' ? photoPair(photos) : null;
  const key = pair ? `${pair.before.id}:${pair.after.id}:${JSON.stringify(pair.before.marks)}` : null;
  const known = useSyncExternalStore(subscribe, () => (key ? answers.get(key) : undefined), () => undefined);

  useEffect(() => {
    if (!ready || !key || !pair || answers.has(key)) return;
    answer(key, 'asking');
    askClaude('done-check', { title: item.title, description: item.description, location, marks: pair.before.marks }, [pair.before.uri, pair.after.uri])
      .then((raw) => answer(key, readDoneCheck(raw) ?? 'failed'))
      .catch(() => {
        // No signal, say: asked again the next time the item opens.
        answers.delete(key);
        for (const l of listeners) l();
      });
  }, [ready, key, pair, item.title, item.description, location]);

  if (!ready || !key || known === undefined || known === 'failed') return null;
  if (known === 'asking') {
    return (
      <View style={styles.line} testID="done-check">
        <ActivityIndicator size="small" color={colors.secondary} />
        <Text variant="subheadline" color={colors.secondary} style={styles.words}>
          Claude is comparing the done photo with the first one.
        </Text>
      </View>
    );
  }
  const looksDone = known.verdict === 'done';
  return (
    <View style={styles.line} testID="done-check">
      <Icon name={looksDone ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'} size={17} color={looksDone ? colors.ok : colors.secondary} />
      <Text variant="subheadline" color={looksDone ? colors.ok : colors.label} style={styles.words}>
        {looksDone ? 'Claude: it looks done in the done photo.' : known.verdict === 'left' ? `Claude: ${known.note ?? 'something still looks left.'}` : `Claude cannot tell. ${known.note ?? ''}`.trim()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: layout.margin + 4, marginTop: 8 },
  words: { flex: 1 },
});
