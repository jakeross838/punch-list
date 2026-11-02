// One location's items (or one company's, or what they wait on): each with its time, who does
// it and its type, what it waits on, and its photo or an empty slot to take it. The heading says how
// many are open and how long they take, and the filters that are on show as chips. Completed items
// wait under their own heading. In a location, New Item under the list types one in with no camera,
// and the bottom bar steps to the one before or after, with the camera between.
// Past Due lists everything late, the latest first, with the days. Drafts lists what was saved to
// finish later, filling in from the photos while it shows. A Waiting On list can stop the wait for all its items at once, or move their Ready By
// together. Select (or a long press on an item) picks items to move, copy, assign, complete or save as
// a template all at once; in a location, the lines at the end of each row drag it into order, with
// the others picked along with it. Copied items paste into any location, on this job or another.
// Add From a Template puts a template's tasks for this location on its list.

import {
  clearHoldup,
  complete,
  dropAt,
  holdNames,
  isAdmin,
  pastePlan,
  commentCounts,
  GROUP_LABELS,
  groupItems,
  isFiltered,
  neighborRooms,
  pastDue,
  pastDueText,
  SHARED_GROUP,
  sortItems,
  totalText,
  totalTime,
  type GroupBy,
  type Item,
  type Photo,
} from "@punch/core";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { CAMERA_BAR_HEIGHT, CameraBar, RoomStep } from "@/components/CameraBar";
import { CommonTasks } from "@/components/CommonTasks";
import { DragList } from "@/components/DragList";
import { fieldsOf, useFormOptions } from "@/components/ItemForm";
import { usePersonOptions } from "@/components/people";
import { SelectionBar } from "@/components/SelectionBar";
import { AddTemplateSheet, SaveTemplateSheet } from "@/components/TemplateSheets";
import { isFilling, useDraftFill } from "@/components/draftFill";
import { FilterBar } from "@/components/FilterBar";
import { ItemRow } from "@/components/ItemRow";
import { useItemActions } from "@/components/useItemActions";
import { colors, layout } from "@/constants/theme";
import { useData } from "@/data/api";
import { capture } from "@/data/capture";
import { clipboard, itemsTitle, itemsWord, useClipboard } from "@/data/clipboard";
import { useFilterContext, useHolds, useJobView } from "@/data/view";
import {
  DateField,
  EmptyState,
  haptic,
  Icon,
  OptionPicker,
  Page,
  Text,
  Touchable,
  useFeedback,
  type BarItem,
} from "@/ui";

interface Section {
  key: "open" | "done";
  title: string | null;
  data: Item[];
}

export default function GroupScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    by: string;
    key: string;
  }>();
  const { jobId, key } = params;
  const due = params.by === "due";
  const drafts = params.by === "drafts";
  const by: GroupBy =
    params.by === "company" || params.by === "waiting" ? params.by : "room";
  const data = useData();
  const feedback = useFeedback();
  const visits = data.useVisits(jobId);
  const context = useFilterContext(jobId);
  const today = context.today;
  const jobs = data.useJobs();
  const job = jobs.find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const [view, setView] = useJobView(jobId, data.useViewSettings());
  const [showDone, setShowDone] = useState(false);
  const [common, setCommon] = useState(false);
  const actions = useItemActions(jobId);
  const commentsOn = commentCounts(data.useComments(jobId));
  const holds = useHolds(jobId);
  const fill = useDraftFill();
  const me = data.useMe();
  const admin = isAdmin(me);
  const copied = useClipboard();
  // Picking items to do something to all of them at once.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [sheet, setSheet] = useState<"move" | "assign" | "template" | "save" | null>(null);

  const filters = view.filters;
  const group = useMemo(
    () =>
      groupItems(
        items,
        by,
        { locations, companies },
        { filters, showCompleted: true, context },
      ).find((g) => g.key === key),
    [items, by, key, filters, context, locations, companies],
  );
  const late = useMemo(
    () => (due ? pastDue(items, visits, today) : []),
    [due, items, visits, today],
  );
  const lateBy = useMemo(
    () => new Map(late.map((p) => [p.item.id, p])),
    [late],
  );
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const roomName = useMemo(
    () => new Map(locations.map((l) => [l.id, l.label])),
    [locations],
  );
  const companyName = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  const listed = due
    ? late.map((p) => p.item)
    : drafts
      ? sortItems(items.filter((i) => i.unfinished && i.status === "open"))
      : (group?.items ?? []);
  const open = listed.filter(
    (i) => i.status !== "complete" || actions.checking.has(i.id),
  );
  const done = listed.filter(
    (i) => i.status === "complete" && !actions.checking.has(i.id),
  );
  const doneShown = view.showCompleted || showDone;
  const sections: Section[] = [
    { key: "open", title: null, data: open },
    ...(done.length > 0 && doneShown
      ? [{ key: "done" as const, title: "Completed", data: done }]
      : []),
  ];

  const room = by === "room" ? locations.find((l) => l.id === key) : undefined;
  const { previous, next } = room
    ? neighborRooms(locations, room.id)
    : { previous: null, next: null };
  const holdup =
    by === "waiting" && group && key.startsWith("waiting:")
      ? group.label
      : null;
  const title = due
    ? "Past Due"
    : drafts
      ? "Drafts"
      : (room?.label ??
        (holdup ? `Waiting on ${holdup}` : (group?.label ?? GROUP_LABELS[by])));
  const openTime = totalText(
    totalTime(open.filter((i) => i.status === "open")),
  );
  const subtitle = drafts
    ? `${open.length} ${open.length === 1 ? "draft" : "drafts"}. ${open.some((i) => isFilling(fill, i.id)) ? (open.length === 1 ? "Filling in from the photo." : "Filling in from the photos.") : open.length === 1 ? "Tap it to finish it." : "Tap one to finish it."}`
    : [`${open.length} open`, openTime].filter(Boolean).join(" · ");
  // Each row says what the list does not already: the location outside a location's list, the company outside a company's.
  const inRoom = by === "room" && !due && !drafts;
  const locationFor = (item: Item) =>
    inRoom ? undefined : roomName.get(item.locationId);
  const companyFor = (item: Item) =>
    drafts || (by === "company" && !due)
      ? undefined
      : (companyName.get(item.companyId ?? "") ?? undefined);
  const noteFor = (item: Item) =>
    drafts && isFilling(fill, item.id)
      ? "Filling in from the photo"
      : undefined;
  const lateFor = (item: Item) => {
    const p = lateBy.get(item.id);
    if (!p) return undefined;
    return p.reason === "visit"
      ? `visit ended ${p.days === 1 ? "1 day" : `${p.days} days`} ago`
      : pastDueText(p.days);
  };

  // What it waits on, for every open item it holds up at once.
  const heldUp = holdup
    ? open.filter((i) => i.status === "open" && !i.ready)
    : [];
  function clearAll() {
    if (!holdup || heldUp.length === 0) return;
    const count = heldUp.length === 1 ? "1 item" : `${heldUp.length} items`;
    const both = heldUp.filter((i) => holdNames(i, holds).length > 1).length;
    feedback.actionSheet({
      title: `Stop waiting on ${holdup}?`,
      message: `${heldUp.length === 1 ? "It" : `All ${heldUp.length}`} will be marked ready.${
        both === 0
          ? ""
          : ` ${both === 1 ? "One is" : `${both} are`} also waiting on something else and will keep waiting.`
      }`,
      actions: [
        {
          label: `Mark ${count} Ready`,
          onPress: () => {
            haptic.success();
            const before = heldUp.map((i) => ({
              id: i.id,
              patch: {
                ready: i.ready,
                waitingOn: i.waitingOn,
                waitingOnItems: i.waitingOnItems,
                readyBy: i.readyBy,
              },
            }));
            void data.updateItems(
              heldUp.map((i) => ({
                id: i.id,
                patch: clearHoldup(i, holdup, holds),
              })),
            );
            feedback.toast({
              message: `No longer waiting on ${holdup}`,
              action: {
                label: "Undo",
                onPress: () => void data.updateItems(before),
              },
            });
            router.back();
          },
        },
      ],
    });
  }
  function setAllReadyBy(readyBy: string | null) {
    if (heldUp.length === 0) return;
    haptic.tap();
    void data.updateItems(
      heldUp.map((i) => ({ id: i.id, patch: { readyBy } })),
    );
  }
  const groupReadyBy = heldUp.find((i) => i.readyBy)?.readyBy ?? null;
  // Filling in after a walk: each draft steps to the next one.
  const openUnfinished = (item: Item) =>
    router.push({
      pathname: "/jobs/[jobId]/items/[itemId]",
      params: { jobId, itemId: item.id, from: "unfinished" },
    });

  const goRoom = (id: string) =>
    router.replace({
      pathname: "/jobs/[jobId]/list/[by]/[key]",
      params: { jobId, by: "room", key: id },
    });
  const openCamera = () => {
    capture.start({ jobId, roomId: room?.id ?? null });
    router.push({ pathname: "/jobs/[jobId]/capture", params: { jobId } });
  };
  /** Starting with the words: the form, with no camera. */
  const newItem = () => {
    capture.start({ jobId, roomId: room?.id ?? null });
    capture.discardItem();
    router.push({
      pathname: "/jobs/[jobId]/items/new",
      params: { jobId, typed: "1" },
    });
  };
  /** The photo for an item typed in earlier: the camera, straight onto it. */
  const addPhoto = (item: Item) => {
    capture.start({ jobId, roomId: item.locationId, itemId: item.id });
    router.push({ pathname: "/jobs/[jobId]/capture", params: { jobId } });
  };

  // ---------- picking items, and what can be done to them all at once ----------
  const formOptions = useFormOptions(jobId, room?.id ?? "");
  const personOptions = usePersonOptions(jobId);
  const pickable = open.filter((i) => i.status === "open" || picked.has(i.id));
  const pickedItems = items.filter((i) => picked.has(i.id));
  const canDrag = selecting && !!room && !due && !drafts;
  const startPicking = (first?: Item) => {
    haptic.tap();
    setSelecting(true);
    setPicked(new Set(first ? [first.id] : []));
  };
  const stopPicking = () => {
    setSelecting(false);
    setPicked(new Set());
    setDragging(false);
  };
  const togglePick = (item: Item) => {
    haptic.selection();
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };
  const allPicked = pickable.length > 0 && pickable.every((i) => picked.has(i.id));
  const pickAll = () => {
    haptic.selection();
    setPicked(allPicked ? new Set() : new Set(pickable.map((i) => i.id)));
  };
  const count = itemsWord(pickedItems.length);
  const moveTo = (locationId: string) => {
    const before = pickedItems.map((i) => ({ id: i.id, patch: { locationId: i.locationId, position: i.position ?? null } }));
    const moving = pickedItems.filter((i) => i.locationId !== locationId);
    setSheet(null);
    if (moving.length === 0) return stopPicking();
    haptic.success();
    void data.updateItems(moving.map((i) => ({ id: i.id, patch: { locationId, position: null } })));
    const where = locations.find((l) => l.id === locationId)?.label ?? "the location";
    feedback.toast({ message: `Moved ${itemsWord(moving.length)} to ${where}`, action: { label: "Undo", onPress: () => void data.updateItems(before) } });
    stopPicking();
  };
  const copyPicked = () => {
    clipboard.set({ jobId, items: pickedItems });
    haptic.success();
    feedback.toast({ message: `Copied ${count}. Open any location, on any job, and tap Paste.` });
    stopPicking();
  };
  const assignTo = (personId: string | null) => {
    const before = pickedItems.map((i) => ({ id: i.id, patch: { assignedTo: i.assignedTo } }));
    setSheet(null);
    haptic.success();
    void data.updateItems(pickedItems.map((i) => ({ id: i.id, patch: { assignedTo: personId } })));
    const who = personOptions.find((o) => o.value === personId)?.label;
    feedback.toast({
      message: personId ? `Assigned ${count} to ${who}` : `${count.charAt(0).toUpperCase()}${count.slice(1)} assigned to no one`,
      action: { label: "Undo", onPress: () => void data.updateItems(before) },
    });
    stopPicking();
  };
  const completePicked = () => {
    const doing = pickedItems.filter((i) => i.status === "open" && !i.unfinished);
    if (!me || doing.length === 0) {
      feedback.toast({ message: "Drafts are finished before they are completed." });
      return;
    }
    haptic.success();
    const changes = doing.map((i) => {
      const next = complete(fieldsOf(i), me);
      return { id: i.id, patch: { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt } };
    });
    void data.updateItems(changes);
    feedback.toast({
      message: `Completed ${itemsWord(doing.length)}`,
      action: { label: "Undo", onPress: () => void data.updateItems(doing.map((i) => ({ id: i.id, patch: { status: "open", completedBy: null, completedAt: null } }))) },
    });
    stopPicking();
  };
  /** Let go of a row: it goes before that one, with the others picked along with it. */
  const dropRow = (key: string, before: string | null) => {
    const list = pickable.filter((i) => i.status === "open");
    const moving = picked.has(key) && picked.size > 1 ? list.filter((i) => picked.has(i.id)) : list.filter((i) => i.id === key);
    const ids = new Set(moving.map((i) => i.id));
    // Before a row that moves too: before the next one that stays.
    let at = before === null ? -1 : list.findIndex((i) => i.id === before);
    while (at >= 0 && at < list.length && ids.has(list[at]!.id)) at += 1;
    const target = at >= 0 && at < list.length ? list[at]!.id : null;
    const changes = dropAt(list, moving, target);
    if (changes.length > 0) void data.updateItems(changes.map((c) => ({ id: c.id, patch: { position: c.position } })));
  };
  // ---------- pasting what was copied ----------
  const pasteHere = async () => {
    if (!copied || !room) return;
    const plan = pastePlan(copied.items, { jobId, locationId: room.id }, items, randomUUID);
    if (plan.items.length === 0) {
      feedback.toast({ message: `${plan.skipped.length === 1 ? "It is" : "They are all"} on the list here already.` });
      return;
    }
    try {
      const ids = await data.addItems(plan.items);
      haptic.success();
      const left = plan.skipped.length > 0 ? `. ${plan.skipped.length} already here` : "";
      feedback.toast({
        message: `Pasted ${itemsWord(ids.length)}${left}`,
        action: { label: "Undo", onPress: () => void data.updateItems(ids.map((id) => ({ id, patch: { status: "removed" } }))) },
      });
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof Error ? e.message : "That did not paste. Try again." });
    }
  };
  const inLocation = !!room && !due && !drafts;
  const right: BarItem[] = selecting
    ? [{ kind: "button", label: "Done", variant: "prominent", onPress: stopPicking, testID: "select-done" }]
    : [
        ...(open.length > 0 ? [{ kind: "button" as const, label: "Select", onPress: () => startPicking(), testID: "select" }] : []),
        ...(inLocation
          ? [
              {
                kind: "menu" as const,
                label: "More",
                icon: "ellipsis.circle" as const,
                testID: "list-more",
                groups: [
                  {
                    actions: [
                      { label: "Add From a Template", icon: "templates" as const, onPress: () => setSheet("template"), testID: "list-template" },
                      ...(copied ? [{ label: `Paste ${itemsTitle(copied.items.length)}`, icon: "clipboard" as const, onPress: () => void pasteHere(), testID: "list-paste" }] : []),
                    ],
                  },
                ],
              },
            ]
          : []),
      ];

  return (
    <>
      <Page
        title={title}
        large
        eyebrow={
          room
            ? room.kind === "shared"
              ? SHARED_GROUP
              : (room.floor ?? undefined)
            : undefined
        }
        subtitle={selecting ? `${pickedItems.length} picked` : subtitle}
        backLabel={job?.name}
        background="plain"
        right={right}
        footerHeight={CAMERA_BAR_HEIGHT}
        footer={
          selecting ? (
            <SelectionBar
              count={pickedItems.length}
              tools={[
                ...(inLocation || by === "room" ? [{ icon: "move" as const, label: "Move", onPress: () => setSheet("move"), testID: "picked-move" }] : []),
                { icon: "copy", label: "Copy", onPress: copyPicked, testID: "picked-copy" },
                { icon: "person", label: "Assign", onPress: () => setSheet("assign"), testID: "picked-assign" },
                { icon: "checkmark.circle.fill", label: "Complete", onPress: completePicked, testID: "picked-complete" },
                ...(admin ? [{ icon: "templates" as const, label: "Template", onPress: () => setSheet("save"), testID: "picked-template" }] : []),
              ]}
            />
          ) : (
          <CameraBar
            onCamera={openCamera}
            cameraLabel={
              room ? `Take a Photo in ${room.label}` : "Take a Photo"
            }
            left={
              previous ? (
                <RoomStep
                  direction="previous"
                  label={previous.label}
                  onPress={() => goRoom(previous.id)}
                />
              ) : null
            }
            right={
              next ? (
                <RoomStep
                  direction="next"
                  label={next.label}
                  onPress={() => goRoom(next.id)}
                />
              ) : null
            }
          />
          )
        }
        list={(scroll) => (
          <SectionList
            {...scroll.props}
            scrollEnabled={!dragging}
            sections={canDrag ? [] : selecting ? sections.filter((x) => x.key === "open").map((x) => ({ ...x, data: pickable })) : sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
            ListHeaderComponent={
              <View>
                {scroll.header}
                {inLocation && copied && !selecting ? (
                  <View style={styles.paste} testID="paste-banner">
                    <Icon name="clipboard" size={18} color={colors.tint} />
                    <Text variant="subheadline" style={{ flex: 1 }} numberOfLines={2}>
                      {itemsWord(copied.items.length)} copied{copied.jobId === jobId ? "" : ` from ${jobs.find((j) => j.id === copied.jobId)?.name ?? "another job"}`}
                    </Text>
                    <Touchable feedback="opacity" onPress={() => void pasteHere()} accessibilityRole="button" testID="paste-here" hitSlop={8}>
                      <Text variant="subheadline" weight="600" color={colors.tint}>
                        Paste Here
                      </Text>
                    </Touchable>
                    <Touchable feedback="opacity" onPress={() => clipboard.clear()} accessibilityRole="button" accessibilityLabel="Forget what was copied" testID="paste-clear" hitSlop={10}>
                      <Icon name="xmark.circle.fill" size={18} color={colors.chevron} />
                    </Touchable>
                  </View>
                ) : null}
                {selecting ? (
                  <View style={styles.picking}>
                    <Touchable feedback="opacity" onPress={pickAll} accessibilityRole="button" testID="pick-all" hitSlop={8}>
                      <Text variant="subheadline" weight="600" color={colors.tint}>
                        {allPicked ? "Unpick All" : "Pick All"}
                      </Text>
                    </Touchable>
                    <Text variant="footnote" color={colors.secondary} style={{ flex: 1, textAlign: "right" }} numberOfLines={2}>
                      {canDrag ? "Drag the lines to put them in order." : "Tap items to pick them."}
                    </Text>
                  </View>
                ) : null}
                {canDrag ? (
                  <DragList
                    data={pickable.filter((i) => i.status === "open")}
                    keyOf={(i) => i.id}
                    carried={[...picked]}
                    onDragging={setDragging}
                    onDrop={dropRow}
                    testID="drag-list"
                    renderRow={(item, handle) => (
                      <ItemRow
                        item={item}
                        photo={firstPhoto.get(item.id)}
                        comments={commentsOn.get(item.id)}
                        holds={holds}
                        location={locationFor(item)}
                        company={companyFor(item)}
                        last={false}
                        checking={false}
                        onOpen={actions.onOpen}
                        onCheck={actions.onCheck}
                        onReady={actions.onReady}
                        onRemove={actions.onRemove}
                        select={{ picked: picked.has(item.id), onToggle: togglePick }}
                        trailing={handle}
                      />
                    )}
                  />
                ) : null}
                {due || drafts || selecting ? null : (
                  <FilterBar
                    jobId={jobId}
                    filters={filters}
                    onChange={(next) => setView({ ...view, filters: next })}
                  />
                )}
                {holdup && heldUp.length > 0 ? (
                  <View style={styles.holdup}>
                    <View style={styles.holdupRow}>
                      <Text style={{ flex: 1 }}>Ready By</Text>
                      <DateField
                        value={groupReadyBy}
                        onChange={setAllReadyBy}
                        label={`Ready By for everything waiting on ${holdup}`}
                        testID="holdup-ready-by"
                      />
                    </View>
                    <Touchable
                      feedback="highlight"
                      onPress={clearAll}
                      accessibilityRole="button"
                      testID="holdup-clear"
                      style={[styles.holdupRow, styles.holdupRule]}
                    >
                      <Icon
                        name="checkmark.circle.fill"
                        size={20}
                        color={colors.tint}
                      />
                      <Text color={colors.tint} style={{ flex: 1 }}>
                        Stop Waiting on {holdup}
                      </Text>
                    </Touchable>
                  </View>
                ) : null}
              </View>
            }
            renderSectionHeader={({ section }) =>
              section.title ? (
                <View style={styles.header}>
                  <Text
                    variant="subheadline"
                    weight="600"
                    color={colors.secondary}
                  >
                    {section.title}
                  </Text>
                </View>
              ) : null
            }
            renderSectionFooter={({ section }) =>
              section.key === "open" && !selecting ? (
                <View>
                  {section.data.length === 0 ? (
                    <EmptyState
                      icon="checkmark.circle.fill"
                      title={drafts ? "No Drafts" : "Nothing Open"}
                      message={
                        drafts
                          ? "Photos taken in Draft mode wait here to be filled in."
                          : room
                            ? isFiltered(filters)
                              ? "Nothing here fits the filters. Take a photo, or tap New Item to type one in."
                              : "Take a photo, or tap New Item to type one in."
                            : "No open items here right now."
                      }
                    />
                  ) : null}
                  {room && !due && !drafts ? (
                    <View style={styles.newRow}>
                      <Touchable
                        feedback="highlight"
                        onPress={newItem}
                        accessibilityRole="button"
                        testID="new-item-row"
                        style={styles.newItem}
                      >
                        <Icon
                          name="plus.circle.fill"
                          size={24}
                          color={colors.tint}
                        />
                        <Text color={colors.tint} weight="500">
                          New Item
                        </Text>
                      </Touchable>
                      <Touchable
                        feedback="highlight"
                        onPress={() => setCommon(true)}
                        accessibilityRole="button"
                        testID="common-tasks-row"
                        style={styles.newItem}
                      >
                        <Icon name="checklist" size={22} color={colors.tint} />
                        <Text color={colors.tint} weight="500">
                          Common Tasks
                        </Text>
                      </Touchable>
                    </View>
                  ) : null}
                  {done.length > 0 && !doneShown ? (
                    <Touchable
                      feedback="opacity"
                      onPress={() => setShowDone(true)}
                      accessibilityRole="button"
                      testID="show-done"
                      style={styles.showDone}
                    >
                      <Text variant="subheadline" color={colors.tint}>
                        Show {done.length} Completed
                      </Text>
                    </Touchable>
                  ) : null}
                </View>
              ) : null
            }
            renderItem={({ item, index, section }) => (
              <ItemRow
                item={item}
                photo={firstPhoto.get(item.id)}
                comments={commentsOn.get(item.id)}
                holds={holds}
                location={locationFor(item)}
                company={companyFor(item)}
                note={noteFor(item)}
                lateText={lateFor(item)}
                last={index === section.data.length - 1}
                checking={actions.checking.has(item.id)}
                onOpen={drafts ? openUnfinished : actions.onOpen}
                onCheck={actions.onCheck}
                onReady={actions.onReady}
                onRemove={actions.onRemove}
                onAddPhoto={addPhoto}
                onLongPress={drafts || due ? undefined : (i) => startPicking(i)}
                select={selecting ? { picked: picked.has(item.id), onToggle: togglePick } : undefined}
              />
            )}
          />
        )}
      />
      <OptionPicker
        visible={sheet === "move"}
        title={`Move ${itemsTitle(pickedItems.length)} To`}
        options={formOptions.roomOptions}
        value={room?.id ?? null}
        onSelect={moveTo}
        onClose={() => setSheet(null)}
      />
      <OptionPicker
        visible={sheet === "assign"}
        title={`Assign ${itemsTitle(pickedItems.length)} To`}
        options={personOptions}
        value={null}
        onSelect={(v) => assignTo(v === "none" ? null : v)}
        onClose={() => setSheet(null)}
        footer="They show on that person's My Items."
      />
      {room ? <AddTemplateSheet jobId={jobId} locationId={room.id} visible={sheet === "template"} onClose={() => setSheet(null)} /> : null}
      {admin ? <SaveTemplateSheet jobId={jobId} items={pickedItems} visible={sheet === "save"} onClose={() => setSheet(null)} onSaved={stopPicking} /> : null}
      {room ? (
        <CommonTasks
          jobId={jobId}
          locationId={room.id}
          visible={common}
          onClose={() => setCommon(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  paste: {
    minHeight: 48,
    marginHorizontal: layout.margin,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 14,
    borderRadius: layout.radius,
    backgroundColor: colors.chipOn,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  picking: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: layout.inset, paddingTop: 6, paddingBottom: 6 },
  holdup: {
    marginHorizontal: layout.margin,
    marginTop: 6,
    marginBottom: 8,
    borderRadius: layout.radius,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  holdupRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  holdupRule: { borderTopWidth: layout.hairline, borderTopColor: colors.rule },
  header: {
    paddingHorizontal: layout.inset,
    paddingTop: 24,
    paddingBottom: 4,
    backgroundColor: colors.background,
  },
  showDone: {
    height: 40,
    justifyContent: "center",
    paddingHorizontal: layout.inset,
    marginTop: 8,
    alignSelf: "flex-start",
  },
  newRow: { flexDirection: "row", flexWrap: "wrap" },
  newItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: layout.inset - 1,
    paddingRight: layout.inset,
  },
});
