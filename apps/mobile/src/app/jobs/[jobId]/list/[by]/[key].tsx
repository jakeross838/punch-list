// One location's items (or one company's or person's, or what they wait on), Site Office style: the
// location's counts under its title, then its items in white panels by who they are assigned to, each with a status pill and a
// short note. Completed items wait under Completed at the end, which opens and closes with a tap
// (open from the start when View has Show Completed on). In a location the end of the list has New
// Item, Common Tasks and the next location of the walk; Capture in the bottom bar takes the photo
// here. Ready and Waiting list the job's items by state, by company. Drafts lists what was saved to
// finish later, filling in from the photos while it shows. A Waiting On list can stop the wait for
// all its items at once. Select (or a long press on an item) picks items to move, copy, assign,
// complete or save as a template all at once; in a location, the lines at the end of each row drag
// it into order, with the others picked along with it. Copied items paste into any location, on this
// job or another.

import {
  assigneeFields,
  assigneeKey,
  assigneeName,
  keyName,
  personOfKey,
  companyList,
  clearHoldup,
  complete,
  dropAt,
  keepTogether,
  holdNames,
  isAdmin,
  pastePlan,
  commentCounts,
  GROUP_LABELS,
  groupItems,
  isFiltered,
  neighborRooms,
  SHARED_GROUP,
  sortItems,
  type GroupBy,
  type Item,
  type Photo,
} from "@punch/core";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { CommonTasks } from "@/components/CommonTasks";
import { DragList } from "@/components/DragList";
import { fieldsOf, useFormOptions } from "@/components/ItemForm";
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
  EmptyState,
  haptic,
  Icon,
  LedgerRow,
  MetaLine,
  OptionPicker,
  Page,
  Panel,
  SectionLabel,
  Segmented,
  Text,
  Touchable,
  useFeedback,
  type BarItem,
} from "@/ui";

interface Section {
  key: string;
  kind: "open" | "done";
  title: string | null;
  /** Who the section's items are assigned to, as a key: a company's id or a person's key. */
  assignee?: string | null;
  data: Item[];
}

type State = "ready" | "waiting" | "check";
const STATES: readonly (readonly [State, string])[] = [
  ["ready", "Ready"],
  ["waiting", "Waiting"],
  ["check", "To Check"],
];

/** Which state an open item is in, for the Ready, Waiting and To Check lists. To Check: the company says it is done. */
export function stateOf(item: Item): State | null {
  if (item.status !== "open" || item.unfinished) return null;
  if (item.markedDoneAt) return "check";
  return item.ready ? "ready" : "waiting";
}

export default function GroupScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    by: string;
    key: string;
  }>();
  const { jobId, key } = params;
  const drafts = params.by === "drafts";
  const stateList: State | null = params.by === "state" ? (STATES.some(([v]) => v === key) ? (key as State) : "ready") : null;
  const by: GroupBy =
    params.by === "company" || params.by === "waiting" ? params.by : "room";
  const data = useData();
  const feedback = useFeedback();
  const context = useFilterContext(jobId);
  const jobs = data.useJobs();
  const job = jobs.find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const people = data.usePeople();
  const [view, setView] = useJobView(jobId, data.useViewSettings());
  // Completed opens and closes with a tap; until then it follows Show Completed in View.
  const [doneOpen, setDoneOpen] = useState<boolean | null>(null);
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
        // Each trade's items together, so the list does not jump between trades.
        { locations, companies, people, trades },
        { filters, showCompleted: true, context },
      ).find((g) => g.key === key),
    [items, by, key, filters, context, locations, companies, people, trades],
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
  const personName = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people],
  );

  const stateCounts = useMemo(() => {
    const n: Record<State, number> = { ready: 0, waiting: 0, check: 0 };
    for (const i of items) {
      const st = stateOf(i);
      if (st) n[st] += 1;
    }
    return n;
  }, [items]);
  const listed = drafts
    ? sortItems(items.filter((i) => i.unfinished && i.status === "open"))
    : stateList
      ? sortItems(items.filter((i) => stateOf(i) === stateList))
      : (group?.items ?? []);
  // A company's list goes in the order to do the work, numbered the same as on its printed list
  // and its page: what is ready first, starting with whatever holds up the most other work.
  const work = useMemo(() => {
    if (by !== "company" || drafts || stateList || personOfKey(key) || key === "none") return null;
    const list = companyList(key, items, { locations, companies, items, trades });
    const lines = [...list.ready, ...list.waiting.flatMap((g) => g.lines)];
    return {
      step: new Map(lines.flatMap((l) => (l.step !== null ? [[l.item.id, l.step] as const] : []))),
      freed: new Map(lines.map((l) => [l.item.id, l.freed])),
    };
  }, [by, drafts, stateList, key, items, locations, companies, trades]);
  const open = listed
    .filter((i) => i.status !== "complete" || actions.checking.has(i.id))
    // Numbered work first, in its order; drafts, work to be quoted and work to check after, as they were.
    .sort((a, b) => (work?.step.get(a.id) ?? 1e9) - (work?.step.get(b.id) ?? 1e9));
  const done = listed.filter(
    (i) => i.status === "complete" && !actions.checking.has(i.id),
  );
  const doneShown = doneOpen ?? view.showCompleted;
  // In a location and on the state lists, the open items go by who they are assigned to, in the order they come.
  const byCompany = (by === "room" && !drafts) || !!stateList;
  const openSections: Section[] = [];
  if (byCompany) {
    for (const item of open) {
      const assignee = assigneeKey(item);
      let section = openSections.find((x) => x.assignee === assignee);
      if (!section) {
        const title = assignee ? (keyName(assignee, { companies: companyName, people: personName }) ?? "Someone") : "Not assigned yet";
        section = { key: `open-${assignee ?? "none"}`, kind: "open", title, assignee, data: [] };
        openSections.push(section);
      }
      section.data.push(item);
    }
  } else if (open.length > 0) {
    openSections.push({ key: "open", kind: "open", title: null, data: open });
  }
  const sections: Section[] = [
    ...openSections,
    ...(done.length > 0
      ? [{ key: "done", kind: "done" as const, title: "Completed", data: doneShown ? done : [] }]
      : []),
  ];
  const toggleDone = () => {
    haptic.selection();
    setDoneOpen(!doneShown);
  };

  const room = by === "room" ? locations.find((l) => l.id === key) : undefined;
  const { previous, next } = room
    ? neighborRooms(locations, room.id)
    : { previous: null, next: null };
  const holdup =
    by === "waiting" && group && key.startsWith("waiting:")
      ? group.label
      : null;
  const title = drafts
    ? "Drafts"
    : stateList
      ? (STATES.find(([v]) => v === stateList)?.[1] ?? "Ready")
      : (room?.label ??
        (holdup ? `Waiting on ${holdup}` : (group?.label ?? GROUP_LABELS[by])));
  const subtitle = drafts
    ? `${open.length} ${open.length === 1 ? "draft" : "drafts"}. ${open.some((i) => isFilling(fill, i.id)) ? (open.length === 1 ? "Filling in from the photo." : "Filling in from the photos.") : open.length === 1 ? "Tap it to finish it." : "Tap one to finish it."}`
    : undefined;
  const openNow = open.filter((i) => i.status === "open");
  const readyNow = openNow.filter((i) => i.ready && !i.unfinished).length;
  const companiesNow = new Set(openNow.map((i) => i.companyId).filter(Boolean)).size;
  const meta = drafts ? null : (
    <MetaLine
      facts={[
        { text: `${openNow.length} ${stateList === "ready" ? "ready" : stateList === "waiting" ? "waiting" : stateList === "check" ? "to check" : "open"}`, color: stateList === "ready" ? colors.ok : colors.label },
        !stateList && readyNow > 0 ? { text: `${readyNow} ready`, color: colors.ok } : null,
        stateList ? `${companiesNow} ${companiesNow === 1 ? "company" : "companies"}` : null,
      ]}
    />
  );
  // Each row says what the list does not already: the location outside a location's list, the company outside a company's.
  const inRoom = by === "room" && !drafts && !stateList;
  const locationFor = (item: Item) =>
    inRoom ? undefined : roomName.get(item.locationId);
  const assigneeFor = (item: Item) =>
    drafts || byCompany || by === "company"
      ? undefined
      : (assigneeName(item, { companies: companyName, people: personName }) ?? undefined);
  const noteFor = (item: Item) =>
    drafts && isFilling(fill, item.id)
      ? "Filling in from the photo"
      : undefined;

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

  const pickable = open.filter((i) => i.status === "open" || picked.has(i.id));
  const pickedItems = items.filter((i) => picked.has(i.id));
  const canDrag = selecting && !!room && !drafts;
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
  // Assigned To: a company, or someone on the team. Picking one clears the other, and a new
  // company takes the items off the old one's visit and does them in its own trade.
  const assignTo = (key: string) => {
    const fields = assigneeFields(key);
    const before = pickedItems.map((i) => ({ id: i.id, patch: { companyId: i.companyId, assignedTo: i.assignedTo, tradeId: i.tradeId, visitId: i.visitId } }));
    setSheet(null);
    haptic.success();
    void data.updateItems(
      pickedItems.map((i) => ({
        id: i.id,
        patch: {
          ...fields,
          ...(fields.companyId ? { tradeId: formOptions.tradeFor(fields.companyId, i.tradeId) } : {}),
          ...(fields.companyId !== i.companyId ? { visitId: null } : {}),
        },
      })),
    );
    if (fields.companyId && !formOptions.jobCompanies.some((jc) => jc.companyId === fields.companyId)) {
      const usual = companies.find((c) => c.id === fields.companyId)?.defaultTradeId;
      if (usual) void data.addCompanyToJob(jobId, fields.companyId, usual).catch(() => undefined);
    }
    const who = formOptions.assigneeOptions.find((o) => o.value === key)?.label ?? "them";
    feedback.toast({
      message: `Assigned ${count} to ${who}`,
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
      return { id: i.id, patch: { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt, markedDoneAt: null } };
    });
    void data.updateItems(changes);
    feedback.toast({
      message: `Completed ${itemsWord(doing.length)}`,
      // Back as they were, a company's done mark included.
      action: { label: "Undo", onPress: () => void data.updateItems(doing.map((i) => ({ id: i.id, patch: { status: "open", completedBy: null, completedAt: null, markedDoneAt: i.markedDoneAt ?? null } }))) },
    });
    stopPicking();
  };
  /** Let go of a row: it goes before that one, with the others picked along with it. */
  const dropRow = (key: string, before: string | null) => {
    const list = pickable.filter((i) => i.status === "open");
    const moving = picked.has(key) && picked.size > 1 ? list.filter((i) => picked.has(i.id)) : list.filter((i) => i.id === key);
    const ids = new Set(moving.map((i) => i.id));
    // It stays with its trade: let go among another trade, it goes to the nearer end of its own.
    const within = keepTogether(list, key, before, (i) => i.tradeId ?? "");
    // Before a row that moves too: before the next one that stays.
    let at = within === null ? -1 : list.findIndex((i) => i.id === within);
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
  const inLocation = !!room && !drafts && !stateList;
  const right: BarItem[] = selecting
    ? [{ kind: "button", label: "Done", variant: "prominent", onPress: stopPicking, testID: "select-done" }]
    : [
        ...(open.length > 0 ? [{ kind: "button" as const, label: "Select", onPress: () => startPicking(), testID: "select" }] : []),
        ...(inLocation
          ? [
              {
                kind: "menu" as const,
                label: "More",
                icon: "ellipsis" as const,
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

  const crumbWhere = drafts ? "Drafts" : stateList ? title : room ? null : title;
  const crumb = [job?.name ?? "Job", ...(room ? [room.kind === "shared" ? SHARED_GROUP : (room.floor ?? ""), room.label].filter(Boolean) : crumbWhere ? [crumbWhere] : [])];
  const eyebrow = drafts
    ? "Saved to finish later"
    : stateList === "ready"
      ? "Can be done now"
      : stateList === "waiting"
        ? "Waiting on something first"
        : stateList === "check"
          ? "Done, the companies say: check each"
          : room
          ? `Location · ${room.kind === "shared" ? SHARED_GROUP : (room.floor ?? "On the job")}`
          : by === "company"
            ? personOfKey(key)
              ? "Someone on your team"
              : "Company"
            : by === "waiting"
              ? "Waiting on"
              : undefined;
  const marker = stateList === "ready" ? colors.okFill : undefined;
  const noneOpen = open.length === 0 && !selecting;

  const renderRow = ({ item, index, section }: { item: Item; index: number; section: Section }) => (
      <ItemRow
        item={item}
        photo={firstPhoto.get(item.id)}
        comments={commentsOn.get(item.id)}
        holds={holds}
        location={locationFor(item)}
        assignee={assigneeFor(item)}
        note={noteFor(item)}
        step={section.kind === "open" && !selecting ? work?.step.get(item.id) : undefined}
        freed={section.kind === "open" ? work?.freed.get(item.id) : undefined}
        first={index === 0}
        last={index === section.data.length - 1}
        stripe={index % 2 === 1}
        checking={actions.checking.has(item.id)}
        completedBy={item.status === "complete" ? personName.get(item.completedBy ?? "") : undefined}
        onOpen={drafts ? openUnfinished : actions.onOpen}
        onCheck={actions.onCheck}
        onReady={actions.onReady}
        onRemove={actions.onRemove}
        onAddPhoto={addPhoto}
        onLongPress={drafts ? undefined : (i) => startPicking(i)}
        select={selecting ? { picked: picked.has(item.id), onToggle: togglePick } : undefined}
      />
    );

  return (
    <>
      <Page
        title={title}
        eyebrow={eyebrow}
        marker={marker}
        subtitle={selecting ? `${pickedItems.length} picked` : subtitle}
        meta={selecting ? undefined : meta}
        crumb={crumb}
        backLabel={job?.name}
        right={right}
        tab={selecting ? undefined : { active: "jobs", jobId, locationId: room?.id ?? null }}
        footerHeight={selecting ? 74 : 0}
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
          ) : undefined
        }
        list={(scroll) => (
          <SectionList
            {...scroll.props}
            scrollEnabled={!dragging}
            sections={canDrag ? [] : selecting ? [{ key: "picking", kind: "open" as const, title: null, data: pickable }] : sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingBottom: scroll.bottomInset }}
            ListHeaderComponent={
              <View>
                {scroll.header}
                {stateList ? (
                  <Segmented
                    options={STATES.map(([v, label]) => [v, `${label} ${stateCounts[v]}`] as const)}
                    value={stateList}
                    onChange={(next) => router.setParams({ key: next })}
                    style={styles.states}
                    testID="state-tabs"
                  />
                ) : null}
                {inLocation && copied && !selecting ? (
                  <View style={styles.paste} testID="paste-banner">
                    <Icon name="clipboard" size={18} color={colors.onBar} />
                    <Text variant="subheadline" color={colors.onBar} style={{ flex: 1 }} numberOfLines={2}>
                      {itemsWord(copied.items.length)} copied{copied.jobId === jobId ? "" : ` from ${jobs.find((j) => j.id === copied.jobId)?.name ?? "another job"}`}
                    </Text>
                    <Touchable feedback="opacity" onPress={() => void pasteHere()} accessibilityRole="button" testID="paste-here" hitSlop={8}>
                      <Text variant="label" weight="600" color={colors.onBar}>
                        Paste Here
                      </Text>
                    </Touchable>
                    <Touchable feedback="opacity" onPress={() => clipboard.clear()} accessibilityRole="button" accessibilityLabel="Forget what was copied" testID="paste-clear" hitSlop={10}>
                      <Icon name="xmark" size={16} color={colors.onBarQuiet} />
                    </Touchable>
                  </View>
                ) : null}
                {selecting ? (
                  <View style={styles.picking}>
                    <Touchable feedback="opacity" onPress={pickAll} accessibilityRole="button" testID="pick-all" hitSlop={8}>
                      <Text variant="label" weight="600" color={colors.tint}>
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
                        assignee={assigneeFor(item)}
                        first
                        last
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
                {drafts || selecting || stateList ? null : (
                  <FilterBar
                    jobId={jobId}
                    filters={filters}
                    onChange={(next) => setView({ ...view, filters: next })}
                  />
                )}
                {holdup && heldUp.length > 0 ? (
                  <Panel style={styles.holdup}>
                    <LedgerRow last onPress={clearAll} chevron={false} lead={<Icon name="checkmark.circle.fill" size={18} color={colors.tint} />} testID="holdup-clear">
                      <Text color={colors.tint}>Stop Waiting on {holdup}</Text>
                    </LedgerRow>
                  </Panel>
                ) : null}
                {noneOpen ? (
                  <EmptyState
                    icon="checkmark.circle.fill"
                    title={drafts ? "No Drafts" : "Nothing Open"}
                    message={
                      drafts
                        ? "Photos saved to finish later wait here to be filled in."
                        : room
                          ? isFiltered(filters)
                            ? "Nothing here fits the filters. Take a photo, or tap New Item to type one in."
                            : "Take a photo with Capture, or tap New Item to type one in."
                          : "No open items here right now."
                    }
                  />
                ) : null}
              </View>
            }
            renderSectionHeader={({ section }) =>
              selecting ? null : section.kind === "done" ? (
                <Touchable
                  feedback="opacity"
                  onPress={toggleDone}
                  accessibilityRole="button"
                  aria-expanded={doneShown}
                  accessibilityLabel={`Completed, ${itemsWord(done.length)}`}
                  accessibilityHint={doneShown ? "Hides the completed items" : "Shows the completed items"}
                  testID="completed-toggle"
                  style={styles.doneHeader}
                >
                  <Text variant="label" color={colors.secondary} style={styles.doneLabel}>
                    Completed
                  </Text>
                  <Text variant="label" color={colors.secondary} tabular testID="completed-count">
                    {done.length}
                  </Text>
                  <Icon name={doneShown ? "chevron.down" : "chevron.right"} size={12} weight="semibold" color={colors.secondary} />
                </Touchable>
              ) : section.title ? (
                <SectionLabel
                  label={section.title}
                  right={String(section.data.length)}
                  style={styles.sectionLabel}
                  testID={`section-${section.key}`}
                />
              ) : (
                <View style={{ height: 8 }} />
              )
            }
            renderSectionFooter={() => <View style={{ height: 2 }} />}
            renderItem={renderRow}
            ListFooterComponent={
              inLocation && !selecting ? (
                <Panel style={styles.tail}>
                  <LedgerRow onPress={newItem} chevron={false} lead={<Icon name="plus" size={16} color={colors.tint} weight="medium" />} testID="new-item-row">
                    <Text variant="label" color={colors.tint}>
                      New Item
                    </Text>
                  </LedgerRow>
                  <LedgerRow onPress={() => setCommon(true)} chevron={false} lead={<Icon name="checklist" size={16} color={colors.tint} />} testID="common-tasks-row" last={!next && !previous}>
                    <Text variant="label" color={colors.tint}>
                      Add common tasks
                    </Text>
                  </LedgerRow>
                  {next ? (
                    <LedgerRow onPress={() => goRoom(next.id)} trail={<Text variant="callout">{next.label}</Text>} testID="next-location" last={!previous} accessibilityLabel={`Next location, ${next.label}`}>
                      <Text variant="label" color={colors.secondary}>
                        Next location
                      </Text>
                    </LedgerRow>
                  ) : null}
                  {previous ? (
                    <LedgerRow onPress={() => goRoom(previous.id)} trail={<Text variant="callout">{previous.label}</Text>} testID="previous-location" last accessibilityLabel={`Previous location, ${previous.label}`}>
                      <Text variant="label" color={colors.secondary}>
                        Previous location
                      </Text>
                    </LedgerRow>
                  ) : null}
                </Panel>
              ) : undefined
            }
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
        options={formOptions.assigneeOptions}
        value={null}
        onSelect={assignTo}
        onClose={() => setSheet(null)}
        footer="A company gets them on its list. Someone on your team gets them on their My Items."
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
  states: { marginHorizontal: layout.margin, marginTop: 2 },
  paste: {
    minHeight: 48,
    marginHorizontal: layout.margin,
    marginTop: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.bar,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  picking: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: layout.inset, paddingTop: 6, paddingBottom: 10 },
  holdup: { marginTop: 10 },
  sectionLabel: { marginTop: 16, marginBottom: 8 },
  doneHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: layout.inset,
    marginTop: 18,
    marginBottom: 8,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  doneLabel: { flex: 1, fontSize: 11 },
  tail: { marginTop: 18 },
});
