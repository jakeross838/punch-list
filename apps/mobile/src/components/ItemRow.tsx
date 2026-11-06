// One item in a list, Site Office style: the square box to check it off, the title, then a status
// pill (Ready, Waiting, 3 Days Late, To Check, Draft, Complete) with a short mono note beside it:
// what it waits on, when its visit is, who said it is done. Where it is and who does it go under
// that in lists that are not one location's or one company's. Its photo sits at the end; an open
// item with no photo yet has an empty dashed slot: tap it to take the photo. How many comments it
// has shows too. Swipe left for Ready and Remove. Rows sit in a white panel, every other one
// striped; the first and last close the panel's edges.

import {
  commentCountText,
  dayOfDate,
  daysBetween,
  holdText,
  hoursText,
  kindText,
  missingDetails,
  readyByOf,
  waitingOnText,
  type HoldLookups,
  type Item,
  type Photo,
} from '@punch/core';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, dayOf, Icon, isBeforeToday, PhotoView, Pill, shortDate, SwipeRow, Text, Touchable, weekdayDate, type PillTone, type SwipeAction } from '@/ui';

const PHOTO = 44;

/** The pill and the note beside it, for an item as it stands. */
export function itemStatus(
  item: Item,
  options: { holds?: HoldLookups; checking?: boolean; lateText?: string; note?: string; completedBy?: string; company?: string },
): { tone: PillTone; text: string; note?: string } {
  const { holds, checking, lateText, note, completedBy, company } = options;
  if (item.status === 'complete' || checking) {
    const when = item.completedAt && !Number.isNaN(new Date(item.completedAt).getTime()) ? dayOf(item.completedAt) : null;
    return { tone: 'done', text: 'Complete', note: [when, completedBy].filter(Boolean).join(' · ') || undefined };
  }
  if (item.unfinished) {
    const needs = missingDetails(item).filter((m) => m !== 'title');
    return { tone: 'draft', text: 'Draft', note: note ?? (needs.length > 0 ? `Needs a ${needs.join(' and ')}` : undefined) };
  }
  if (item.markedDoneAt) {
    return { tone: 'check', text: 'To Check', note: `${company ?? 'The company'} says done · ${dayOf(item.markedDoneAt)}` };
  }
  if (!item.ready) {
    const late = item.readyBy !== null && isBeforeToday(item.readyBy);
    const days = late && item.readyBy ? daysBetween(item.readyBy, dayOfDate(new Date())) : 0;
    const on = holds ? holdText(item, holds) : waitingOnText(item.waitingOn);
    const by = holds ? readyByOf(item, holds) : item.readyBy;
    const waits = on ? `On ${on}` : undefined;
    if (lateText) return { tone: 'late', text: lateText, note: waits };
    if (late) return { tone: 'late', text: `${days} ${days === 1 ? 'Day' : 'Days'} Late`, note: waits };
    return { tone: 'wait', text: 'Waiting', note: [waits, by ? `Ready by ${shortDate(by)}` : null].filter(Boolean).join(' · ') || undefined };
  }
  if (lateText) return { tone: 'late', text: lateText };
  const visit = item.visitId ? holds?.visits.get(item.visitId) : undefined;
  if (item.kind === 'added_scope' && !item.poOrCo) return { tone: 'quote', text: 'To Be Quoted' };
  return { tone: 'ok', text: 'Ready', note: visit ? `Visit ${weekdayDate(visit.start)}` : undefined };
}

export const ItemRow = memo(function ItemRow({
  item,
  photo,
  location,
  company,
  note,
  lateText,
  comments = 0,
  holds,
  first = false,
  last,
  stripe = false,
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
  /** Past Due's own words for how late it is. */
  lateText?: string;
  /** How many comments it has. */
  comments?: number;
  /** The job's items and visits: to name the tasks it waits on and when they are scheduled. */
  holds?: HoldLookups;
  /** The first row of its panel: draws the panel's top edge. */
  first?: boolean;
  /** The last row of its panel: draws the panel's bottom edge. */
  last: boolean;
  /** Every other row is striped. */
  stripe?: boolean;
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
  /** Picking items: a tap picks it or not, in place of opening it, and the box says which. */
  select?: { picked: boolean; onToggle: (item: Item) => void };
  /** At the very end of the row: the handle to drag it by. */
  trailing?: ReactNode;
  /** Who completed it, by name, for a completed item. */
  completedBy?: string;
}) {
  const done = item.status === 'complete' || checking;
  const open = item.status === 'open' && !checking;
  const title = item.title || 'No title yet';
  const time = item.hours !== null && open ? hoursText(item.hours) : null;
  const status = itemStatus(item, { holds, checking, lateText, note, completedBy, company });
  const kind = item.kind === 'completion' || item.unfinished ? undefined : kindText(item);
  const where = [location, company, kind].filter(Boolean).join(' · ');
  const talk = comments > 0 ? commentCountText(comments) : undefined;

  const actions: SwipeAction[] =
    open && !select
      ? [
          ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.okFill, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
          { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
        ]
      : [];
  const slot = !photo && !!onAddPhoto && open && !select;
  const said = [title, item.priority ? 'Priority' : null, time, status.text, status.note, where, talk].filter(Boolean).join(', ');

  return (
    <SwipeRow actions={actions} style={[styles.swipe, first ? styles.first : null, last ? styles.last : styles.ruled]}>
      <Touchable
        feedback="highlight"
        pressDelay={50}
        onPress={() => (select ? select.onToggle(item) : onOpen(item))}
        onLongPress={onLongPress && !select ? () => onLongPress(item) : undefined}
        delayLongPress={450}
        style={[styles.row, stripe ? styles.stripe : null]}
        accessibilityRole={select ? 'checkbox' : 'button'}
        accessibilityState={select ? { checked: select.picked } : undefined}
        accessibilityLabel={said}
        testID={`item-${item.id}`}
      >
        <View style={styles.lead}>
          {select ? (
            <View style={[styles.pick, select.picked ? styles.picked : null]} testID={`pick-${item.id}`}>
              {select.picked ? <Icon name="checkmark" size={14} color={colors.onBar} weight="bold" /> : null}
            </View>
          ) : item.unfinished ? (
            <View style={styles.draft}>
              <Icon name="pencil.tip" size={12} color={colors.secondary} weight="medium" />
            </View>
          ) : (
            <CompleteCircle checked={done} onPress={() => onCheck(item)} label={done ? `Reopen ${item.title}` : `Complete ${item.title}`} testID={`check-${item.id}`} />
          )}
        </View>
        <View style={styles.text}>
          <View style={styles.titleLine}>
            {item.priority && open ? <View style={styles.priority} accessibilityLabel="Priority" /> : null}
            <Text numberOfLines={2} color={done || !item.title ? colors.secondary : colors.label} style={[styles.title, done ? styles.crossed : null]}>
              {title}
            </Text>
            {time ? (
              <Text variant="label" color={colors.secondary} tabular style={styles.time} testID={`time-${item.id}`}>
                {time}
              </Text>
            ) : null}
          </View>
          <View style={styles.statusLine}>
            <Pill text={status.text} tone={status.tone} />
            {status.note ? (
              <Text variant="stamp" color={colors.secondary} numberOfLines={1} style={styles.note} testID={done ? `done-${item.id}` : undefined}>
                {status.note}
              </Text>
            ) : null}
          </View>
          {where ? (
            <Text variant="stamp" color={colors.secondary} numberOfLines={1} style={styles.where}>
              {where}
            </Text>
          ) : null}
        </View>
        {talk ? (
          <View style={styles.talk} accessible={false}>
            <Icon name="message" size={14} color={colors.secondary} />
            <Text variant="label" color={colors.secondary} tabular>
              {comments}
            </Text>
          </View>
        ) : null}
        {photo ? <PhotoView photo={photo} width={PHOTO} height={PHOTO} /> : slot ? <View style={styles.photoSpace} /> : null}
        {trailing}
      </Touchable>
      {slot ? (
        // Beside the row rather than in it: a button inside a button is not allowed on the web.
        <Touchable
          feedback="opacity"
          onPress={() => onAddPhoto?.(item)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Take a photo for ${item.title || 'this draft'}`}
          testID={`add-photo-${item.id}`}
          style={[styles.photoSlot, { right: layout.rowPadding + (trailing ? 34 : 0) }]}
        >
          <Icon name="camera" size={16} color={colors.quiet} />
        </Touchable>
      ) : null}
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  swipe: {
    marginHorizontal: layout.margin,
    backgroundColor: colors.cell,
    borderLeftWidth: layout.hairline,
    borderRightWidth: layout.hairline,
    borderColor: colors.border,
  },
  first: { borderTopWidth: layout.hairline },
  last: { borderBottomWidth: layout.hairline },
  ruled: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: layout.rowPadding, paddingVertical: 11, backgroundColor: colors.cell, minHeight: 60 },
  stripe: { backgroundColor: '#F7F9F9' },
  lead: { paddingTop: 0 },
  text: { flex: 1, minWidth: 0, gap: 5 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1 },
  priority: { width: 6, height: 6, marginTop: 7, backgroundColor: colors.destructive },
  crossed: { textDecorationLine: 'line-through', textDecorationColor: colors.secondary },
  time: { paddingTop: 3 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  note: { flexShrink: 1, letterSpacing: 1 },
  where: { letterSpacing: 1.1 },
  talk: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingTop: 2 },
  pick: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.quiet, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell },
  picked: { borderColor: colors.action, backgroundColor: colors.action },
  draft: { width: 22, height: 22, borderWidth: 1.5, borderColor: colors.quiet, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoSpace: { width: PHOTO, height: PHOTO },
  photoSlot: {
    position: 'absolute',
    top: 11,
    width: PHOTO,
    height: PHOTO,
    borderWidth: 1.25,
    borderColor: colors.quiet,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cell,
  },
});
