// One item in the Completion List: the circle to check it off, the title, where exactly, who does
// it, and a line with a small hourglass when it is waiting on something. Plain on white with a
// hairline under the text. Swipe left for Ready and Remove.

import { itemNumberLabel, type GroupBy, type Item } from '@punch/core';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, dayOf, Icon, isBeforeToday, shortDate, SwipeRow, Text, Touchable, type SwipeAction } from '@/ui';

export interface Names {
  of: (id: string | null) => string;
  person: (id: string | null) => string;
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text variant="footnote" weight="500">
        {label}
      </Text>
    </View>
  );
}

export const ItemRow = memo(function ItemRow({
  item,
  by,
  names,
  last,
  checking,
  onOpen,
  onCheck,
  onReady,
  onRemove,
}: {
  item: Item;
  by: GroupBy;
  names: Names;
  last: boolean;
  /** Just checked: shows complete for a moment before it leaves the list. */
  checking: boolean;
  onOpen: (item: Item) => void;
  onCheck: (item: Item) => void;
  onReady: (item: Item) => void;
  onRemove: (item: Item) => void;
}) {
  const done = item.status === 'complete' || checking;
  const company = names.of(item.companyId);
  const trade = names.of(item.tradeId);
  const room = names.of(item.locationId);
  const who = by === 'room' ? [company, trade] : by === 'trade' ? [room, company] : [room, trade];
  const meta = who.filter(Boolean).join(' · ');
  const late = !item.ready && item.readyBy !== null && isBeforeToday(item.readyBy);
  const waiting =
    item.status === 'open' && !item.ready
      ? `Waiting on ${item.waitingOn ?? 'something'}${item.readyBy ? ` · Ready by ${shortDate(item.readyBy)}` : ''}${late ? ', past due' : ''}`
      : null;
  const completed = item.status === 'complete' && item.completedAt ? `Completed ${dayOf(item.completedAt)} by ${names.person(item.completedBy)}` : null;
  const scope = item.kind === 'added_scope';
  const actions: SwipeAction[] =
    item.status === 'open' && !checking
      ? [
          ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.tint, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
          { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
        ]
      : [];

  return (
    <SwipeRow actions={actions} style={styles.swipe}>
      <Touchable
        feedback="highlight"
        pressDelay={50}
        onPress={() => onOpen(item)}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${meta}`}
        testID={`item-${item.id}`}
      >
        <CompleteCircle
          checked={done}
          animate={checking}
          onPress={() => onCheck(item)}
          label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
          testID={`check-${item.id}`}
        />
        <View style={[styles.text, last ? null : styles.divider]}>
          <View style={styles.titleLine}>
            <Text numberOfLines={2} color={done ? colors.secondary : colors.label} style={{ flex: 1 }}>
              {item.title}
            </Text>
            <Text variant="footnote" color={colors.secondary} tabular>
              {itemNumberLabel(item)}
            </Text>
          </View>
          {item.description ? (
            <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          {meta ? (
            <Text variant="subheadline" color={colors.secondary} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          {waiting ? (
            <View style={styles.status}>
              <Icon
                name={late ? 'exclamationmark.circle.fill' : 'hourglass'}
                size={14}
                color={late ? colors.destructive : colors.label}
                weight="semibold"
                style={styles.statusIcon}
              />
              <Text variant="subheadline" numberOfLines={2} style={{ flex: 1 }}>
                {waiting}
              </Text>
            </View>
          ) : null}
          {completed ? (
            <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
              {completed}
            </Text>
          ) : null}
          {scope ? (
            <View style={styles.tags}>
              <Tag label="Added Scope" />
              <Tag label={item.boughtOut && item.poOrCo ? item.poOrCo : 'Not Bought Out'} />
            </View>
          ) : null}
        </View>
      </Touchable>
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  swipe: { backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingLeft: layout.inset, paddingTop: 12, backgroundColor: colors.background },
  text: { flex: 1, gap: 2, paddingRight: layout.inset, paddingBottom: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 4 },
  statusIcon: { marginTop: 3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.surface },
});
