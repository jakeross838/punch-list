// One item in the Completion List, Reminders style: the circle to check it off, the title, the
// description, who does it, and a colored line when it is waiting on something. Swipe left for
// Ready and Remove.

import { itemNumberLabel, type GroupBy, type Item } from '@punch/core';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, dayOf, Icon, isBeforeToday, Separator, shortDate, SwipeRow, Text, Touchable, type SwipeAction } from '@/ui';

export interface Names {
  of: (id: string | null) => string;
  person: (id: string | null) => string;
}

const CIRCLE_TEXT_START = layout.rowPadding + 24 + 14;

function Tag({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <Text variant="caption1" weight="600" color={color}>
        {label}
      </Text>
    </View>
  );
}

export const ItemRow = memo(function ItemRow({
  item,
  by,
  names,
  first,
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
  first: boolean;
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
      ? `Waiting on ${item.waitingOn ?? 'something'}${item.readyBy ? ` · Ready by ${shortDate(item.readyBy)}` : ''}`
      : null;
  const completed = item.status === 'complete' && item.completedAt ? `Completed ${dayOf(item.completedAt)} by ${names.person(item.completedBy)}` : null;
  const scope = item.kind === 'added_scope';
  const actions: SwipeAction[] =
    item.status === 'open' && !checking
      ? [
          ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.green, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
          { label: 'Remove', icon: 'trash', color: colors.red, onPress: () => onRemove(item), testID: `remove-${item.id}` },
        ]
      : [];

  return (
    <SwipeRow actions={actions} style={[styles.card, first ? styles.first : null, last ? styles.last : null]}>
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
        <View style={styles.text}>
          <Text numberOfLines={2} color={done ? colors.secondary : colors.label}>
            {item.title}
          </Text>
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
                color={late ? colors.red : colors.orange}
                weight="semibold"
                style={styles.statusIcon}
              />
              <Text variant="subheadline" weight="500" color={late ? colors.redText : colors.orangeText} numberOfLines={2} style={{ flex: 1 }}>
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
              <Tag label="Added Scope" color={colors.indigoText} background="rgba(88, 86, 214, 0.12)" />
              {item.boughtOut && item.poOrCo ? (
                <Tag label={item.poOrCo} color={colors.secondary} background={colors.fill4} />
              ) : (
                <Tag label="Not Bought Out" color={colors.redText} background="rgba(255, 59, 48, 0.1)" />
              )}
            </View>
          ) : null}
        </View>
        <Text variant="footnote" color={colors.tertiary} tabular style={styles.number}>
          {itemNumberLabel(item)}
        </Text>
        {last ? null : <Separator inset={CIRCLE_TEXT_START} />}
      </Touchable>
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  card: { marginHorizontal: layout.margin, backgroundColor: colors.cell, overflow: 'hidden' },
  first: { borderTopLeftRadius: layout.radius, borderTopRightRadius: layout.radius },
  last: { borderBottomLeftRadius: layout.radius, borderBottomRightRadius: layout.radius },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingLeft: layout.rowPadding,
    paddingRight: layout.rowPadding - 2,
    paddingVertical: 13,
    backgroundColor: colors.cell,
  },
  text: { flex: 1, gap: 2 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  statusIcon: { marginTop: 3 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  number: { minWidth: 22, textAlign: 'right', paddingTop: 2 },
});
