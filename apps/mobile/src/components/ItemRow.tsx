// One item in a list, kept calm: the circle to check it off, the title, a small hourglass when it
// is not ready, the days in red under the title when it is past due, and its photo. Everything else
// is one tap in. Swipe left for Ready and Remove. A draft shows a pencil instead of the
// circle and what it still needs.

import { dayOfDate, daysBetween, missingDetails, pastDueText, type Item, type Photo } from '@punch/core';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, Icon, isBeforeToday, PhotoView, SwipeRow, Text, Touchable, type SwipeAction } from '@/ui';

export const ItemRow = memo(function ItemRow({
  item,
  photo,
  context,
  lateText,
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
  /** A second line where the list does not say it already: the location, in a list by trade. */
  context?: string;
  /** Past Due's own words for how late it is, in place of the Ready By days. */
  lateText?: string;
  last: boolean;
  /** Just checked: shows complete for a moment before it leaves the list. */
  checking: boolean;
  onOpen: (item: Item) => void;
  onCheck: (item: Item) => void;
  onReady: (item: Item) => void;
  onRemove: (item: Item) => void;
}) {
  const done = item.status === 'complete' || checking;
  const notReady = item.status === 'open' && !item.ready && !item.unfinished;
  const late = notReady && item.readyBy !== null && isBeforeToday(item.readyBy);
  const lateDays = late && item.readyBy ? daysBetween(item.readyBy, dayOfDate(new Date())) : 0;
  const red = lateText ?? (late ? pastDueText(lateDays) : undefined);
  const title = item.title || 'No title yet';
  // In a location, what a draft still needs (a missing title already shows as No title
  // yet); in other lists, where it is.
  const needs = item.unfinished && !context ? missingDetails(item).filter((m) => m !== 'title') : [];
  const second = context ?? (needs.length > 0 ? `Needs a ${needs.join(' and ')}` : '');
  const actions: SwipeAction[] =
    item.status === 'open' && !checking
      ? [
          ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.tint, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
          { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
        ]
      : [];
  const said = [title, second, notReady ? 'not ready' : null, red].filter(Boolean).join(', ');

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
        {item.unfinished ? (
          <View style={styles.draft}>
            <Icon name="pencil.tip" size={15} color={colors.tint} weight="semibold" />
          </View>
        ) : (
          <CompleteCircle
            checked={done}
            animate={checking}
            onPress={() => onCheck(item)}
            label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
            testID={`check-${item.id}`}
          />
        )}
        <View style={[styles.body, last ? null : styles.divider]}>
          <View style={styles.text}>
            <Text numberOfLines={2} color={done || !item.title ? colors.secondary : colors.label}>
              {title}
            </Text>
            {second || red ? (
              <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
                {second}
                {second && red ? ', ' : ''}
                {red ? (
                  <Text variant="subheadline" weight="600" color={colors.destructive}>
                    {red}
                  </Text>
                ) : null}
              </Text>
            ) : null}
          </View>
          {notReady ? <Icon name="hourglass" size={16} color={colors.quiet} weight="semibold" /> : null}
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
  draft: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.circle, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
