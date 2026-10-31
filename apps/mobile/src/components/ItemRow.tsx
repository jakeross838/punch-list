// One item in a list, crisp and complete at a glance: the circle to check it off, the title with
// its estimated time at the right, then who does it and what type of work it is (and where, in lists
// that are not one location's), then what it waits on when it is not ready, with the days in red
// when it is past due. Its photo sits at the end; an open item with no photo yet has an empty slot:
// tap it to take the photo. How many comments it has shows too. Everything else is one tap in.
// Swipe left for Ready and Remove. A draft shows a pencil instead of the circle and what it still needs.

import {
  commentCountText,
  dayOfDate,
  daysBetween,
  hoursText,
  isPriced,
  KIND_LABELS,
  missingDetails,
  pastDueText,
  waitingOnText,
  type Item,
  type Photo,
} from '@punch/core';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, Icon, isBeforeToday, PhotoView, shortDate, SwipeRow, Text, Touchable, type SwipeAction } from '@/ui';

const PHOTO = 40;

/** The type of work, in words: "Deficiency", "Additional, needs a price". */
export function kindText(item: Pick<Item, 'kind' | 'poOrCo'>): string {
  return item.kind === 'added_scope' && !isPriced(item) ? 'Additional, needs a price' : KIND_LABELS[item.kind];
}

export const ItemRow = memo(function ItemRow({
  item,
  photo,
  location,
  company,
  note,
  lateText,
  comments = 0,
  last,
  checking,
  onOpen,
  onCheck,
  onReady,
  onRemove,
  onAddPhoto,
}: {
  item: Item;
  /** The item's first photo, shown small at the end of the row. */
  photo?: Photo;
  /** Where it is, in lists that are not one location's. */
  location?: string;
  /** Who does it, in lists that are not one company's. */
  company?: string;
  /** For a draft: said in place of what it still needs, like "Filling in from the photo". */
  note?: string;
  /** Past Due's own words for how late it is, in place of the Ready By days. */
  lateText?: string;
  /** How many comments it has. */
  comments?: number;
  last: boolean;
  /** Just checked: shows complete for a moment before it leaves the list. */
  checking: boolean;
  onOpen: (item: Item) => void;
  onCheck: (item: Item) => void;
  onReady: (item: Item) => void;
  onRemove: (item: Item) => void;
  /** Takes a photo for an item that has none yet. */
  onAddPhoto?: (item: Item) => void;
}) {
  const done = item.status === 'complete' || checking;
  const open = item.status === 'open' && !checking;
  const notReady = open && !item.ready && !item.unfinished;
  const late = notReady && item.readyBy !== null && isBeforeToday(item.readyBy);
  const lateDays = late && item.readyBy ? daysBetween(item.readyBy, dayOfDate(new Date())) : 0;
  const lateWords = lateText ?? (late ? pastDueText(lateDays) : undefined);
  // On a line of its own it starts with a capital: "Visit ended 3 days ago".
  const red = lateWords && !notReady ? lateWords.charAt(0).toUpperCase() + lateWords.slice(1) : lateWords;
  const title = item.title || 'No title yet';
  const time = item.hours !== null ? hoursText(item.hours) : null;

  // What a draft still needs (a missing title already shows as No title yet).
  const needs = item.unfinished ? missingDetails(item).filter((m) => m !== 'title') : [];
  const draftNote = note ?? (needs.length > 0 ? `Needs a ${needs.join(' and ')}` : undefined);
  const talk = comments > 0 ? commentCountText(comments) : undefined;
  const meta = (item.unfinished ? [location, draftNote, talk] : [location, company, kindText(item), talk]).filter(Boolean).join(' · ');
  const waiting = notReady ? `Waiting on ${waitingOnText(item.waitingOn) || 'something'}${item.readyBy && !late ? `, ready by ${shortDate(item.readyBy)}` : ''}` : undefined;

  const actions: SwipeAction[] = open
    ? [
        ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.tint, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
        { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
      ]
    : [];
  const said = [title, time, meta, waiting, red].filter(Boolean).join(', ');

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
        <View style={[styles.lead, item.unfinished ? styles.leadDraft : null]}>
          {item.unfinished ? (
            <View style={styles.draft}>
              <Icon name="pencil.tip" size={13} color={colors.tint} weight="semibold" />
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
        </View>
        <View style={[styles.body, last ? null : styles.divider]}>
          <View style={styles.text}>
            <View style={styles.titleLine}>
              <Text numberOfLines={2} weight="500" color={done || !item.title ? colors.secondary : colors.label} style={styles.title}>
                {title}
              </Text>
              {time ? (
                <Text variant="footnote" color={colors.secondary} tabular style={styles.time} testID={`time-${item.id}`}>
                  {time}
                </Text>
              ) : null}
            </View>
            {meta ? (
              <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
                {meta}
              </Text>
            ) : null}
            {waiting || red ? (
              <View style={styles.status}>
                {notReady ? <Icon name="hourglass" size={11} color={late ? colors.destructive : colors.quiet} weight="semibold" style={styles.hourglass} /> : null}
                <Text variant="subheadline" color={colors.secondary} numberOfLines={2} style={{ flexShrink: 1 }}>
                  {waiting}
                  {waiting && red ? ', ' : ''}
                  {red ? (
                    <Text variant="subheadline" weight="600" color={colors.destructive}>
                      {red}
                    </Text>
                  ) : null}
                </Text>
              </View>
            ) : null}
          </View>
          {photo ? (
            <PhotoView photo={photo} width={PHOTO} height={PHOTO} radius={6} />
          ) : onAddPhoto && open ? (
            <Touchable
              feedback="scale"
              onPress={() => onAddPhoto(item)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Take a photo for ${item.title || 'this draft'}`}
              testID={`add-photo-${item.id}`}
              style={styles.photoSlot}
            >
              <Icon name="camera" size={16} color={colors.quiet} />
            </Touchable>
          ) : null}
        </View>
      </Touchable>
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  swipe: { backgroundColor: colors.background },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 12, paddingLeft: layout.inset, backgroundColor: colors.background },
  // The circle lines up with the title's first line.
  lead: { paddingTop: 7 },
  leadDraft: { paddingTop: 8 },
  body: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingRight: layout.inset },
  divider: { borderBottomWidth: layout.hairline, borderBottomColor: colors.separator },
  text: { flex: 1, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1 },
  time: { paddingTop: 2 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  hourglass: { marginTop: 3 },
  draft: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.circle, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoSlot: { width: PHOTO, height: PHOTO, borderRadius: 6, borderWidth: 1.25, borderColor: colors.circle, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
