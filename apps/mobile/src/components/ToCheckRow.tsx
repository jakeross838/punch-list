// An item a company says is done, waiting for Ross Built to look: its photo, what and where, who
// said it is done and when, and the two answers. Complete checks it off; Not Done sends it back to
// the company's list as open.

import type { Item, Photo } from '@punch/core';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { haptic, Icon, PhotoView, Text, Touchable, useFeedback, whenOf } from '@/ui';

export function ToCheckRow({
  item,
  photo,
  location,
  company,
  first,
  last,
  stripe,
  onOpen,
  onComplete,
}: {
  item: Item;
  photo?: Photo;
  location?: string;
  company?: string;
  first: boolean;
  last: boolean;
  stripe: boolean;
  onOpen: (item: Item) => void;
  onComplete: (item: Item) => void;
}) {
  const data = useData();
  const feedback = useFeedback();
  const said = item.markedDoneAt ? `${company ?? 'The company'} · ${whenOf(item.markedDoneAt)}` : company;
  const notDone = () => {
    haptic.tap();
    const was = item.markedDoneAt ?? null;
    void data.updateItems([{ id: item.id, patch: { markedDoneAt: null } }]);
    feedback.toast({
      message: `Back on ${company ?? 'the company'}'s list as not done`,
      action: { label: 'Undo', onPress: () => void data.updateItems([{ id: item.id, patch: { markedDoneAt: was } }]) },
    });
  };
  return (
    <View style={[styles.row, first ? styles.first : null, last ? styles.last : styles.ruled, stripe ? styles.stripe : null]} testID={`check-row-${item.id}`}>
      <Touchable feedback="highlight" onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${location ?? ''}. ${said ?? ''}`} style={styles.open}>
        {photo ? (
          <PhotoView photo={photo} width={64} height={64} />
        ) : (
          <View style={styles.noPhoto}>
            <Icon name="photo.on.rectangle" size={20} color={colors.quiet} />
          </View>
        )}
        <View style={styles.text}>
          <Text weight="500" numberOfLines={2}>
            {item.title || 'No title yet'}
          </Text>
          {location ? (
            <Text variant="stamp" color={colors.secondary} numberOfLines={1}>
              {location}
            </Text>
          ) : null}
          {said ? (
            <Text variant="footnote" color={colors.secondary} numberOfLines={1}>
              {said}
            </Text>
          ) : null}
        </View>
      </Touchable>
      <View style={styles.answers}>
        <Touchable
          feedback="opacity"
          onPress={() => onComplete(item)}
          accessibilityRole="button"
          accessibilityLabel={`Complete ${item.title}`}
          testID={`check-complete-${item.id}`}
          style={[styles.answer, styles.complete]}
        >
          <Icon name="checkmark" size={13} color={colors.onBar} weight="bold" />
          <Text variant="label" color={colors.onBar}>
            Complete
          </Text>
        </Touchable>
        <Touchable
          feedback="opacity"
          onPress={notDone}
          accessibilityRole="button"
          accessibilityLabel={`${item.title} is not done`}
          testID={`check-not-done-${item.id}`}
          style={styles.answer}
        >
          <Text variant="label" color={colors.label}>
            Not Done
          </Text>
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginHorizontal: layout.margin,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: colors.cell,
    borderLeftWidth: layout.hairline,
    borderRightWidth: layout.hairline,
    borderColor: colors.border,
  },
  first: { borderTopWidth: layout.hairline },
  last: { borderBottomWidth: layout.hairline },
  ruled: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  stripe: { backgroundColor: '#F7F9F9' },
  open: { flexDirection: 'row', gap: 12 },
  noPhoto: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.stripe },
  text: { flex: 1, minWidth: 0, gap: 4 },
  answers: { flexDirection: 'row', gap: 6, paddingLeft: 76 },
  answer: { height: 32, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.borderStrong },
  complete: { backgroundColor: colors.action, borderColor: colors.action },
});
