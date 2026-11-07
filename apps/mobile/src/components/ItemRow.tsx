// One item in a list, as Reminders draws its reminders: the circle to check it off, the title, then
// a status tag (Ready, Waiting, To Be Quoted, Draft, Complete) with a short note beside it: what it
// waits on, or what a draft still needs. Where it is and who does it go under that in lists that are
// not one location's or one company's. Its photo sits at the end as a rounded thumbnail; an open item
// with no photo yet has an empty dashed slot: tap it to take the photo. How many comments it has
// shows too. Swipe left for Ready and Remove. Each row is a piece of a white rounded card: the first
// and last get the corners, and the thin lines between rows start where the words do.

import { commentCountText, freesText, holdText, hoursText, kindText, missingDetails, needsText, waitingOnText, type Freed, type HoldLookups, type Item, type Photo } from '@punch/core';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { CompleteCircle, dayOf, Icon, PhotoView, Pill, shortDate, SwipeRow, Text, Touchable, type PillTone, type SwipeAction } from '@/ui';

const PHOTO = 44;

/** The pill and the note beside it, for an item as it stands. */
export function itemStatus(
  item: Item,
  options: { holds?: HoldLookups; checking?: boolean; note?: string; completedBy?: string },
): { tone: PillTone; text: string; note?: string } {
  const { holds, checking, note, completedBy } = options;
  if (item.status === 'complete' || checking) {
    const when = item.completedAt && !Number.isNaN(new Date(item.completedAt).getTime()) ? dayOf(item.completedAt) : null;
    return { tone: 'done', text: 'Complete', note: [when, completedBy].filter(Boolean).join(' · ') || undefined };
  }
  // The company said it is done, from its page: it waits for someone at your company to look.
  if (item.markedDoneAt && item.status === 'open' && !item.unfinished) {
    const when = !Number.isNaN(new Date(item.markedDoneAt).getTime()) ? dayOf(item.markedDoneAt) : null;
    return { tone: 'check', text: 'To Check', note: when ? `Done ${when}, by the company` : 'Done, by the company' };
  }
  if (item.unfinished) {
    const needs = needsText(missingDetails(item).filter((m) => m !== 'title'));
    return { tone: 'draft', text: 'Draft', note: note ?? (needs || undefined) };
  }
  if (!item.ready) {
    const on = holds ? holdText(item, holds) : waitingOnText(item.waitingOn);
    // Beside the Waiting pill the note says what on, and when it should be ready if that is known.
    const by = item.readyBy ? `Ready by ${shortDate(item.readyBy)}` : null;
    return { tone: 'wait', text: 'Waiting', note: [on ? `On ${on}` : null, by].filter(Boolean).join(' · ') || undefined };
  }
  if (item.kind === 'added_scope' && !item.poOrCo) return { tone: 'quote', text: 'To Be Quoted' };
  return { tone: 'ok', text: 'Ready' };
}

export const ItemRow = memo(function ItemRow({
  item,
  photo,
  location,
  assignee,
  note,
  comments = 0,
  holds,
  first = false,
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
  step,
  freed,
}: {
  item: Item;
  /** The item's first photo, shown small at the end of the row. */
  photo?: Photo;
  /** Where it is, in lists that are not one location's. */
  location?: string;
  /** Who it is assigned to, a company or someone on the team, in lists that are not one company's. */
  assignee?: string;
  /** For a draft: said in place of what it still needs, like "Filling in from the photo". */
  note?: string;
  /** How many comments it has. */
  comments?: number;
  /** The job's items and visits: to name the tasks it waits on and when they are scheduled. */
  holds?: HoldLookups;
  /** The first row of its card: gets the top corners. */
  first?: boolean;
  /** The last row of its card: gets the bottom corners and no line under it. */
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
  /** Picking items: a tap picks it or not, in place of opening it, and the box says which. */
  select?: { picked: boolean; onToggle: (item: Item) => void };
  /** At the very end of the row: the handle to drag it by. */
  trailing?: ReactNode;
  /** Who completed it, by name, for a completed item. */
  completedBy?: string;
  /** Its place in the order to do the company's work, on a company's list: 1 first. */
  step?: number;
  /** What finishing it frees up, on a company's list. */
  freed?: Freed;
}) {
  const done = item.status === 'complete' || checking;
  const open = item.status === 'open' && !checking;
  const title = item.title || 'No title yet';
  const status = itemStatus(item, { holds, checking, note, completedBy });
  // The type, unless the tag already says it: To Be Quoted is the Additional work not priced yet.
  const kind = item.kind === 'completion' || item.unfinished ? undefined : status.tone === 'quote' ? 'Additional' : kindText(item);
  const time = item.hours !== null && item.hours > 0 && open ? hoursText(item.hours) : undefined;
  const frees = open && freed ? freesText(freed) || undefined : undefined;
  const where = [frees, location, assignee, kind, time].filter(Boolean).join(' · ');
  const numbered = open && !!step && !select;
  const confirmed = open && !!item.confirmedAt && !item.markedDoneAt && !item.unfinished;
  const talk = comments > 0 ? commentCountText(comments) : undefined;

  const actions: SwipeAction[] =
    open && !select
      ? [
          ...(item.ready ? [] : [{ label: 'Ready', icon: 'checkmark' as const, color: colors.okFill, onPress: () => onReady(item), testID: `ready-${item.id}` }]),
          { label: 'Remove', icon: 'trash', color: colors.destructive, onPress: () => onRemove(item), testID: `remove-${item.id}` },
        ]
      : [];
  const slot = !photo && !!onAddPhoto && open && !select;
  const said = [numbered ? `Number ${step}` : null, title, item.priority ? 'Priority' : null, status.text, confirmed ? 'Confirmed by the company' : null, status.note, where, talk]
    .filter(Boolean)
    .join(', ');

  return (
    <SwipeRow actions={actions} style={[styles.swipe, first ? styles.first : null, last ? styles.last : null]}>
      <View testID={`item-${item.id}`}>
        <Touchable
          feedback="highlight"
          pressDelay={50}
          onPress={() => (select ? select.onToggle(item) : onOpen(item))}
          onLongPress={onLongPress && !select ? () => onLongPress(item) : undefined}
          delayLongPress={450}
          style={styles.row}
          accessibilityRole={select ? 'checkbox' : 'button'}
          aria-checked={select ? select.picked : undefined}
          accessibilityLabel={said}
          testID={`open-${item.id}`}
        >
          <View style={styles.lead}>
            {select ? (
              <View style={[styles.pick, select.picked ? styles.picked : null]} testID={`pick-${item.id}`}>
                {select.picked ? <Icon name="checkmark" size={13} color={colors.white} weight="bold" /> : null}
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
              {numbered ? (
                <View style={styles.step}>
                  <Text variant="footnote" weight="700" tabular testID={`step-${item.id}`}>
                    {step}
                  </Text>
                </View>
              ) : null}
              <Text numberOfLines={2} color={done || !item.title ? colors.secondary : colors.label} style={[styles.title, done ? styles.crossed : null]}>
                {item.priority && open ? (
                  <Text color={colors.destructive} weight="700" accessibilityLabel="Priority">
                    {'! '}
                  </Text>
                ) : null}
                {title}
              </Text>
            </View>
            <View style={styles.statusLine}>
              <Pill text={status.text} tone={status.tone} />
              {confirmed ? <Pill text="Confirmed" tone="ok" /> : null}
              {status.note ? (
                <Text variant="subheadline" color={colors.secondary} numberOfLines={2} style={styles.note} testID={done ? `done-${item.id}` : undefined}>
                  {status.note}
                </Text>
              ) : null}
            </View>
            {where ? (
              <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
                {where}
              </Text>
            ) : null}
          </View>
          {talk ? (
            <View style={styles.talk} accessible={false}>
              <Icon name="message" size={14} color={colors.secondary} />
              <Text variant="subheadline" color={colors.secondary} tabular>
                {comments}
              </Text>
            </View>
          ) : null}
          {photo ? <PhotoView photo={photo} width={PHOTO} height={PHOTO} radius={8} /> : slot ? <View style={styles.photoSpace} /> : null}
          {trailing}
        </Touchable>
        {last ? null : <View style={styles.rule} />}
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
      </View>
    </SwipeRow>
  );
});

// The line under a row starts where the words do: past the circle.
const TEXT_START = layout.rowPadding + 22 + 12;

const styles = StyleSheet.create({
  swipe: { marginHorizontal: layout.margin, backgroundColor: colors.cell, overflow: 'hidden' },
  first: { borderTopLeftRadius: layout.radius, borderTopRightRadius: layout.radius },
  last: { borderBottomLeftRadius: layout.radius, borderBottomRightRadius: layout.radius },
  rule: { position: 'absolute', left: TEXT_START, right: 0, bottom: 0, height: 0, borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: layout.rowPadding, paddingVertical: 11, backgroundColor: colors.cell, minHeight: 60 },
  lead: { paddingTop: 0 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1 },
  // Done is crossed off, as in most to do lists.
  crossed: { textDecorationLine: 'line-through', textDecorationColor: colors.secondary },
  step: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.chip },
  statusLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, minWidth: 0 },
  note: { flexShrink: 1 },
  talk: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingTop: 2 },
  pick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.circle, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cell },
  picked: { borderColor: colors.action, backgroundColor: colors.action },
  draft: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.circle, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoSpace: { width: PHOTO, height: PHOTO },
  photoSlot: {
    position: 'absolute',
    top: 11,
    width: PHOTO,
    height: PHOTO,
    borderRadius: 8,
    borderWidth: 1.25,
    borderColor: colors.circle,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cell,
  },
});
