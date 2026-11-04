// One item in a list, crisp and complete at a glance: the circle to check it off, the title with
// its estimated time at the right, then who does it and what type of work it is (and where, in lists
// that are not one location's), then what it waits on when it is not ready, with the days in red
// when it is past due. Its photo sits at the end; an open item with no photo yet has an empty slot:
// tap it to take the photo. How many comments it has shows too. Everything else is one tap in.
// Swipe left for Ready and Remove. A draft shows a pencil instead of the circle and what it still needs.
// A completed item is checked off and crossed off, with when it was completed and by whom; its
// circle opens it again.

import {
  commentCountText,
  dayOfDate,
  daysBetween,
  holdText,
  hoursText,
  kindText,
  missingDetails,
  pastDueText,
  readyByOf,
  waitingOnText,
  type HoldLookups,
  type Item,
  type Photo,
} from '@punch/core';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, dayOf, Icon, isBeforeToday, PhotoView, shortDate, SwipeRow, Text, Touchable, type SwipeAction } from '@/ui';

const PHOTO = 40;


export const ItemRow = memo(function ItemRow({
  item,
  photo,
  location,
  company,
  note,
  lateText,
  comments = 0,
  holds,
  last,
  checking,
  onOpen,
  onCheck,
  onReady,
  onRemove,
  onAddPhoto,
  onLongPress,
  select,
  trailing,
  completedBy,
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
  /** The job's items and visits: to name the tasks it waits on and when they are scheduled. */
  holds?: HoldLookups;
  last: boolean;
  /** Just checked: shows complete for a moment before it leaves the list. */
  checking: boolean;
  onOpen: (item: Item) => void;
  onCheck: (item: Item) => void;
  onReady: (item: Item) => void;
  onRemove: (item: Item) => void;
  /** Takes a photo for an item that has none yet. */
  onAddPhoto?: (item: Item) => void;
  /** A long press: start picking items, with this one picked. */
  onLongPress?: (item: Item) => void;
  /** Picking items: a tap picks it or not, in place of opening it, and the circle says which. */
  select?: { picked: boolean; onToggle: (item: Item) => void };
  /** At the very end of the row: the handle to drag it by. */
  trailing?: ReactNode;
  /** Who completed it, by name, for a completed item. */
  completedBy?: string;
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
  // Completed: when and by whom, in place of Incomplete, which it no longer is.
  const completed = item.status === 'complete' && !checking;
  const doneWhen = completed && item.completedAt && !Number.isNaN(new Date(item.completedAt).getTime()) ? dayOf(item.completedAt) : null;
  const doneText = completed ? ['Completed', doneWhen, completedBy ? `by ${completedBy}` : null].filter(Boolean).join(' ') : undefined;
  const kind = completed && item.kind === 'completion' ? undefined : kindText(item);
  const meta = (item.unfinished ? [location, draftNote, talk] : [location, company, kind, talk]).filter(Boolean).join(' · ');
  const on = holds ? holdText(item, holds) : waitingOnText(item.waitingOn);
  const by = holds ? readyByOf(item, holds) : item.readyBy;
  const waiting = notReady ? `Waiting on ${on || 'something'}${by && !late ? `, ready by ${shortDate(by)}` : ''}` : undefined;

  const actions: SwipeAction[] = open && !select
    ? [
        ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.tint, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
        { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
      ]
    : [];
  const said = [title, time, meta, waiting, red, doneText].filter(Boolean).join(', ');

  return (
    <SwipeRow actions={actions} style={styles.swipe}>
      <Touchable
        feedback="highlight"
        pressDelay={50}
        onPress={() => (select ? select.onToggle(item) : onOpen(item))}
        onLongPress={onLongPress && !select ? () => onLongPress(item) : undefined}
        delayLongPress={450}
        style={styles.row}
        accessibilityRole={select ? 'checkbox' : 'button'}
        accessibilityState={select ? { checked: select.picked } : undefined}
        accessibilityLabel={said}
        testID={`item-${item.id}`}
      >
        <View style={[styles.lead, item.unfinished && !select ? styles.leadDraft : null]}>
          {select ? (
            <View style={[styles.pick, select.picked ? styles.picked : null]} testID={`pick-${item.id}`}>
              {select.picked ? <Icon name="checkmark" size={12} color={colors.white} weight="bold" /> : null}
            </View>
          ) : item.unfinished ? (
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
              <Text numberOfLines={2} weight="500" color={done || !item.title ? colors.secondary : colors.label} style={[styles.title, done ? styles.crossed : null]}>
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
            {doneText ? (
              <View style={styles.status}>
                <Icon name="checkmark" size={11} color={colors.quiet} weight="semibold" style={styles.hourglass} />
                <Text variant="subheadline" color={colors.secondary} numberOfLines={2} style={{ flexShrink: 1 }} testID={`done-${item.id}`}>
                  {doneText}
                </Text>
              </View>
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
          ) : onAddPhoto && open && !select ? (
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
          {trailing}
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
  crossed: { textDecorationLine: 'line-through', textDecorationColor: colors.secondary },
  time: { paddingTop: 2 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  hourglass: { marginTop: 3 },
  pick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.circle, alignItems: 'center', justifyContent: 'center' },
  picked: { borderColor: colors.tint, backgroundColor: colors.tint },
  draft: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.circle, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoSlot: { width: PHOTO, height: PHOTO, borderRadius: 6, borderWidth: 1.25, borderColor: colors.circle, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
