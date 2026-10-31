// The camera, for walking the job room by room. The location the photos go to sits at the top; tap
// it to change it, or Next when the room is done: it is marked walked and the camera goes on to the
// next location in floor order. The shutter never asks for anything first: each photo saves
// straight away as an item in that location (or with no location yet, when none is picked), a
// draft until someone checks it, and Claude starts filling it in from the photo. The last one
// shows by the shutter: tap it to finish it now (mark it up, fix the title, pick the location).
// Type an Item makes one without a photo, and Common Tasks adds the usual work for this kind of
// room with a tap. Under the shutter: how many locations are walked, and when everything is done,
// the walk's drafts counted as Claude fills them in, with how far the walk moved it.
//
// Opened for one item (Add Photo on an item), the photo is marked up and goes on that item. Opened
// from the New Item form for its photo, the photo is marked up and goes back to the form.

import { floorOf } from "@punch/core";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCanSuggest } from "@/ai/suggest";
import { leaveOrConfirm } from "@/components/discard";
import { CommonTasks } from "@/components/CommonTasks";
import { draftFill } from "@/components/draftFill";
import { startDraft } from "@/components/ItemForm";
import { MarkupEditor, type MarkupShot } from "@/components/MarkupEditor";
import { Viewfinder, type ViewfinderHandle } from "@/components/Viewfinder";
import { colors } from "@/constants/theme";
import { useData } from "@/data/api";
import { capture, useCapture } from "@/data/capture";
import { useTimeline } from "@/data/view";
import {
  haptic,
  Icon,
  OptionPicker,
  PhotoView,
  shortDate,
  Text,
  Touchable,
  useFeedback,
  weekdayDate,
  type Option,
} from "@/ui";

export default function CaptureScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const walk = useCapture();
  const locations = data.useLocations(jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const formSettings = data.useFormSettings();
  const canFill = useCanSuggest();
  const titles = data.useTitles();
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const jobCompanies = data.useJobCompanies(jobId);
  // When everything is done, the drafts from the walk counted as Claude fills them in.
  const finish = useTimeline(jobId, true).finish;
  const finder = useRef<ViewfinderHandle>(null);
  const [shot, setShot] = useState<MarkupShot | null>(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [common, setCommon] = useState(false);
  // Common Tasks needs the location first: picking one opens them.
  const [thenCommon, setThenCommon] = useState(false);

  // The locations in floor order, each saying when it is walked.
  const ordered = useMemo(
    () =>
      [...locations]
        .filter((l) => l.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [locations],
  );
  const roomOptions = useMemo<Option[]>(
    () =>
      ordered.map((l) => ({
        value: l.id,
        label: l.label,
        group: floorOf(l),
        hint: l.walkedAt ? "Walked" : undefined,
      })),
    [ordered],
  );
  const walkedCount = ordered.filter((l) => l.walkedAt).length;
  const room = locations.find((l) => l.id === walk.roomId);
  const saved = walk.lastSaved;

  // The finish date as the walk begins, to say how far the walk moves it.
  useEffect(() => {
    capture.noteFinish(finish);
  }, [finish]);

  // The saved note shows for a moment over the viewfinder, then goes.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => capture.clearSaved(), 2600);
    return () => clearTimeout(t);
  }, [saved]);
  const editing = walk.editing
    ? walk.shots.find((s) => s.key === walk.editing)
    : undefined;
  const addingTo = walk.itemId
    ? items.find((i) => i.id === walk.itemId)
    : undefined;
  // Each photo saves as an item, unless this photo is for one item or for the New Item form.
  const walking = !walk.itemId && !walk.draft;
  // The last one saved, while it is still a draft or on the list, with its photo as it is now.
  const lastItem =
    walking && walk.last
      ? items.find((i) => i.id === walk.last!.itemId && i.status === "open")
      : undefined;
  const lastPhoto = lastItem
    ? (photos.find((p) => p.itemId === lastItem.id) ?? {
        ...walk.last!,
        marks: [],
      })
    : undefined;

  async function grab(how: "take" | "pick") {
    if (busy) return;
    if (how === "take") haptic.tap();
    setBusy(true);
    try {
      const photo = await (how === "take"
        ? finder.current?.take()
        : finder.current?.pick());
      if (photo && walking) await saveSnap(photo);
      else if (photo) setShot({ ...photo, marks: [] });
    } catch {
      feedback.toast({ message: "The photo did not come through. Try again." });
    } finally {
      setBusy(false);
    }
  }

  /**
   * The photo becomes an item in the location, a draft for now, and Claude starts filling it in.
   * With no location picked yet it saves anyway, to have its location picked when it is finished.
   */
  async function saveSnap(photo: {
    uri: string;
    width: number;
    height: number;
  }) {
    const { locationId, ...fields } = startDraft(
      walk.roomId ?? "",
      formSettings,
    );
    const id = await data.createItem({
      ...fields,
      unfinished: true,
      jobId,
      locationId,
      source: "walk",
    });
    await data.addPhotos([
      {
        jobId,
        itemId: id,
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        marks: [],
      },
    ]);
    haptic.success();
    // Claude starts on it now, so it is filled in by the time the walk is done.
    if (canFill) {
      draftFill.add(
        [
          {
            item: { ...fields, id, locationId, unfinished: true },
            photo: { uri: photo.uri, marks: [] },
          },
        ],
        {
          data,
          titles,
          trades,
          companies,
          jobCompanies,
          locations,
        },
      );
    }
    capture.snapped(id, photo, room?.label ?? null);
  }

  function openForm() {
    router.push({ pathname: "/jobs/[jobId]/items/new", params: { jobId } });
  }

  /** Done here: this location is walked, and the camera goes on to the next one not walked yet, in floor order. */
  function nextRoom() {
    haptic.selection();
    if (room) void data.setWalked([room.id], true);
    const at = room ? ordered.findIndex((l) => l.id === room.id) : -1;
    const next = [
      ...ordered.slice(at + 1),
      ...ordered.slice(0, Math.max(0, at)),
    ].find((l) => !l.walkedAt && l.id !== room?.id);
    const done = room ? `${room.label} walked. ` : "";
    if (next) {
      capture.setRoom(next.id);
      capture.say(`${done}Now in ${next.label}`);
    } else {
      capture.say(`${done}Every location is walked`);
    }
  }

  function openCommon() {
    if (!room) {
      setThenCommon(true);
      setPicker(true);
      return;
    }
    setCommon(true);
  }

  function openLast() {
    if (!lastItem) return;
    haptic.selection();
    router.push({
      pathname: "/jobs/[jobId]/items/[itemId]",
      params: { jobId, itemId: lastItem.id, from: "camera" },
    });
  }

  async function keep(marks: MarkupShot["marks"]) {
    if (editing) {
      capture.setMarks(editing.key, marks);
      capture.editShot(null);
      openForm();
      return;
    }
    if (!shot) return;
    if (walk.itemId) {
      await data.addPhotos([
        {
          jobId,
          itemId: walk.itemId,
          uri: shot.uri,
          width: shot.width,
          height: shot.height,
          marks,
        },
      ]);
      haptic.success();
      setShot(null);
      // Back to the walk this came from, or to where the camera was opened.
      const back = !!walk.resume;
      capture.doneAdding(
        back
          ? `Added the photo to ${addingTo?.title || "the item"}`
          : undefined,
      );
      if (!back) router.back();
      return;
    }
    capture.addShot({ ...shot, marks });
    setShot(null);
    openForm();
  }

  function close() {
    // Opened from a form to take its photo: back to the form, as it was.
    if (walk.draft) {
      openForm();
      return;
    }
    // A photo for an item, from the walk: no photo after all, and the walk carries on.
    if (walk.itemId && walk.resume && !shot) {
      capture.doneAdding();
      return;
    }
    leaveOrConfirm(
      !!shot || walk.shots.length > 0,
      feedback,
      () => {
        capture.end();
        router.back();
      },
      "this photo",
    );
  }

  if (editing || shot) {
    const current = editing ?? shot!;
    return (
      <>
        <StatusBar style="light" />
        <MarkupEditor
          key={editing?.key ?? current.uri}
          shot={current}
          retakeLabel={editing ? "Cancel" : "Retake"}
          doneLabel={editing ? "Done" : walk.itemId ? "Add" : "Next"}
          onRetake={() => {
            if (editing) {
              capture.editShot(null);
              openForm();
            } else setShot(null);
          }}
          onDone={(marks) => void keep(marks)}
        />
      </>
    );
  }

  const hint = walk.itemId
    ? `The photo goes on ${addingTo?.title || "the item"}.`
    : walk.draft
      ? "The photo goes on the new item."
      : walk.saved > 0
        ? `${walk.saved} saved on this walk.${lastItem ? " Tap the photo to finish it now." : ""}`
        : canFill
          ? "Each photo saves as an item. Claude fills it in."
          : "Each photo saves as an item.";

  const moved =
    walk.startFinish && finish && walk.startFinish !== finish
      ? `, was ${shortDate(walk.startFinish)}`
      : "";
  const walkedLine =
    walkedCount > 0 ? `${walkedCount} of ${ordered.length} walked.` : "";
  const finishLine = walking
    ? [walkedLine, finish ? `Done by ${weekdayDate(finish)}${moved}.` : ""]
        .filter(Boolean)
        .join(" ") || null
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="capture">
      <StatusBar style="light" />
      <View style={styles.bar}>
        <Touchable
          feedback="opacity"
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close the Camera"
          testID="camera-close"
          style={styles.round}
        >
          <Icon
            name="xmark"
            size={20}
            color={colors.onDark}
            weight="semibold"
          />
        </Touchable>
        <View style={styles.middle}>
          <Touchable
            feedback="scale"
            onPress={() => setPicker(true)}
            disabled={!!walk.itemId}
            accessibilityRole="button"
            accessibilityLabel={
              room
                ? `Location, ${room.label}. Change the location`
                : "Choose the location"
            }
            testID="camera-room"
            style={styles.room}
          >
            <Text
              variant="subheadline"
              weight="600"
              color={colors.onDark}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {room?.label ?? "Choose Location"}
            </Text>
            {walk.itemId ? null : (
              <Icon
                name="chevron.down"
                size={12}
                color={colors.onDark}
                weight="bold"
              />
            )}
          </Touchable>
          {walking ? (
            <Touchable
              feedback="scale"
              onPress={nextRoom}
              accessibilityRole="button"
              accessibilityLabel={
                room ? `Done in ${room.label}. Next location` : "Next location"
              }
              testID="camera-next"
              style={styles.next}
            >
              <Text variant="subheadline" weight="600" color={colors.onDark}>
                Next
              </Text>
              <Icon
                name="chevron.right"
                size={12}
                color={colors.onDark}
                weight="bold"
              />
            </Touchable>
          ) : null}
        </View>
        <Touchable
          feedback="opacity"
          onPress={() => setFlash((f) => !f)}
          accessibilityRole="button"
          accessibilityLabel={flash ? "Flash on" : "Flash off"}
          testID="camera-flash"
          style={styles.round}
        >
          <Icon
            name={flash ? "bolt" : "bolt.slash"}
            size={20}
            color={colors.onDark}
          />
        </Touchable>
      </View>

      <View style={styles.finder}>
        <Viewfinder ref={finder} flash={flash} />
        {saved ? (
          <Animated.View
            key={saved.at}
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(260)}
            style={styles.saved}
            pointerEvents="none"
          >
            <Icon
              name="checkmark"
              size={16}
              color={colors.white}
              weight="bold"
            />
            <Text
              variant="subheadline"
              weight="600"
              color={colors.white}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {saved.text ?? (saved.title ? `Saved ${saved.title}` : "Saved")}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.strip}>
        {walking ? (
          <>
            <Touchable
              feedback="opacity"
              onPress={openForm}
              accessibilityRole="button"
              testID="no-photo"
              style={styles.stripButton}
            >
              <Icon name="textformat" size={16} color={colors.onDark} />
              <Text variant="subheadline" weight="600" color={colors.onDark}>
                Type an Item
              </Text>
            </Touchable>
            <Touchable
              feedback="opacity"
              onPress={openCommon}
              accessibilityRole="button"
              testID="camera-common"
              style={styles.stripButton}
            >
              <Icon name="checklist" size={16} color={colors.onDark} />
              <Text variant="subheadline" weight="600" color={colors.onDark}>
                Common Tasks
              </Text>
            </Touchable>
          </>
        ) : null}
      </View>
      <Text
        variant="footnote"
        color={colors.onDarkQuiet}
        align="center"
        style={styles.hint}
        testID="camera-hint"
      >
        {hint}
      </Text>
      {finishLine ? (
        <Text
          variant="footnote"
          weight="600"
          color={colors.onDark}
          align="center"
          style={styles.hint}
          testID="camera-finish"
        >
          {finishLine}
        </Text>
      ) : null}

      <View
        style={[
          styles.controls,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <View style={styles.side}>
          <Touchable
            feedback="scale"
            onPress={() => void grab("pick")}
            accessibilityRole="button"
            accessibilityLabel="Choose from Photos"
            testID="camera-library"
            style={styles.library}
          >
            <Icon name="photo.on.rectangle" size={22} color={colors.onDark} />
          </Touchable>
        </View>
        <Touchable
          feedback="scale"
          onPress={() => void grab("take")}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Take the Photo"
          testID="shutter"
          style={styles.shutter}
        >
          <View style={styles.shutterInner} />
        </Touchable>
        <View style={[styles.side, styles.sideRight]}>
          {lastPhoto ? (
            <Touchable
              key={lastItem!.id}
              feedback="scale"
              onPress={openLast}
              accessibilityRole="button"
              accessibilityLabel={`Finish ${lastItem!.title || "the last item"} now`}
              testID="camera-last"
              style={styles.last}
            >
              <PhotoView photo={lastPhoto} width={44} height={44} radius={9} />
            </Touchable>
          ) : null}
        </View>
      </View>

      <OptionPicker
        visible={picker}
        title="Location"
        options={roomOptions}
        value={walk.roomId}
        onSelect={(id) => {
          capture.setRoom(id);
          if (thenCommon) setTimeout(() => setCommon(true), 350);
        }}
        onClose={() => {
          setPicker(false);
          setThenCommon(false);
        }}
        footer={`${walkedCount > 0 ? `${walkedCount} of ${ordered.length} walked. ` : ""}${thenCommon ? "Its common tasks come next." : "New photos go here until you change it."}`}
      />
      <CommonTasks
        jobId={jobId}
        locationId={walk.roomId}
        visible={common}
        onClose={() => setCommon(false)}
        onAdded={(text) => capture.say(text)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  bar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  middle: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  round: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  room: {
    height: 32,
    maxWidth: 200,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 14,
    paddingRight: 12,
    borderRadius: 16,
    backgroundColor: colors.darkChip,
  },
  next: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 12,
    paddingRight: 10,
    marginLeft: 6,
    borderRadius: 16,
    backgroundColor: colors.darkChip,
  },
  finder: { width: "100%", aspectRatio: 3 / 4, overflow: "hidden" },
  controls: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  side: { flex: 1, flexDirection: "row", alignItems: "center" },
  sideRight: { justifyContent: "flex-end" },
  library: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.darkChip,
  },
  last: {
    width: 48,
    height: 48,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.white,
  },
  strip: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  stripButton: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.darkChip,
  },
  hint: { paddingHorizontal: 32, marginTop: 2 },
  saved: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    maxWidth: "86%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
  },
});
