// One item in a list, kept calm: the circle to check it off, the title, a small hourglass when it
// is not ready, and its photo. Everything else is one tap in. Swipe left for Ready and Remove.

import type { Item, Photo } from '@punch/core';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, Icon, isBeforeToday, PhotoView, SwipeRow, Text, Touchable, type SwipeAction } from '@/ui';

export const ItemRow = memo(function ItemRow({
  item,
  photo,
  context,
  last,
  checking,
  onOpen,
  onCheck,
  onReady,
  onRemove,
}: {
  item: Item;
  /** The item's first photo, shown small at the end of the row. */
  photo?: Photo;
  /** A second line where the list does not say it already: the room, in a list by trade. */
  context?: string;
  last: boolean;
  /** Just checked: shows complete for a moment before it leaves the list. */
  checking: boolean;
  onOpen: (item: Item) => void;
  onCheck: (item: Item) => void;
  onReady: (item: Item) => void;
  onRemove: (item: Item) => void;
}) {
  const done = item.status === 'complete' || checking;
  const notReady = item.status === 'open' && !item.ready;
  const late = notReady && item.readyBy !== null && isBeforeToday(item.readyBy);
  const actions: SwipeAction[] =
    item.status === 'open' && !checking
      ? [
          ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.tint, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
          { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
        ]
      : [];
  const said = [item.title, context, notReady ? (late ? 'not ready, past due' : 'not ready') : null].filter(Boolean).join(', ');

  return (
    <SwipeRow actions={actions} style={styles.swipe}>
      <Touchable
        feedback="highlight"
        pressDelay={50}
        onPress={() => onOpen(item)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={said}
        testID={`item-${item.id}`}
      >
        <CompleteCircle
          checked={done}
          animate={checking}
          onPress={() => onCheck(item)}
          label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
          testID={`check-${item.id}`}
        />
        <View style={[styles.body, last ? null : styles.divider]}>
          <View style={styles.text}>
            <Text numberOfLines={2} color={done ? colors.secondary : colors.label}>
              {item.title}
            </Text>
            {context ? (
              <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
                {context}
              </Text>
            ) : null}
          </View>
          {notReady ? (
            <Icon
              name={late ? 'exclamationmark.circle.fill' : 'hourglass'}
              size={16}
              color={late ? colors.destructive : colors.quiet}
              weight="semibold"
            />
          ) : null}
          {photo ? <PhotoView photo={photo} width={44} height={44} radius={8} /> : null}
        </View>
      </Touchable>
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  swipe: { backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: layout.inset, backgroundColor: colors.background },
  body: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingRight: layout.inset },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  text: { flex: 1, gap: 1 },
});
