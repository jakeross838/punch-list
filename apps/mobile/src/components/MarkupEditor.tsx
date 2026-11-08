// Markup on a photo, made for the job site. The marks used most come first: a circle, an arrow,
// Text (words anywhere, or words that point at the work with an arrow), then Draw. A tap on the photo
// with any of them puts words there: tap and type. A box, a measurement with its size
// written out, and numbered spots for several places with the same work are under More. Tap a mark
// to change it: drag it somewhere else, drag a square to change its shape, give it another color,
// change its words or delete it. Undo and Redo sit at the top, the way Apple's Markup has them. The
// tool and color picked last carry over to the next photo. Next keeps the photo as it is when
// nothing was drawn. The marks are kept apart from the picture, so the original is never changed.
// Crop, under More, turns the photo, levels it and keeps a box of it (CropView): a new picture is
// made, the marks move with it, and the photo as it was stays with the item, removed.

import {
  clampPoint,
  croppedMarks,
  handleAt,
  isNoCrop,
  markAt,
  markFrame,
  markHandles,
  MARK_COLOR_NAMES,
  MARK_COLORS,
  moveHandle,
  moveMark,
  NO_CROP,
  QUICK_NOTES,
  type Mark,
  type MarkColor,
  type MarkHandle,
  type MarkPoint,
  type MarkTool,
  type MeasureUnit,
  type PhotoCrop,
} from '@punch/core';
import { Image } from 'expo-image';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fieldFont } from '@/constants/theme';
import { fitPhoto, haptic, Icon, leaveOrConfirm, MarkLayer, Text, TEXT_LARGEST, Touchable, useFeedback, type IconName } from '@/ui';
import { CropControls, CropFrame } from './CropView';
import { cropPicture, type Picture } from './cropPicture';
import { markupReducer, newMark, pickedMark, sameMarks, shownMarks, startMarkup } from './markupEdits';

interface ToolInfo {
  tool: MarkTool;
  label: string;
  icon: IconName;
  hint: string;
}

const MAIN: ToolInfo[] = [
  { tool: 'circle', label: 'Circle', icon: 'circle', hint: 'Drag across the spot to circle it, or tap to type.' },
  { tool: 'arrow', label: 'Arrow', icon: 'arrow.up.right', hint: 'Drag toward the spot, or tap to type.' },
  { tool: 'text', label: 'Text', icon: 'textformat', hint: 'Tap where the words go, or drag to point them at a spot.' },
  { tool: 'pen', label: 'Draw', icon: 'pencil.tip', hint: 'Draw with your finger, or tap to type.' },
];

const MORE: ToolInfo[] = [
  { tool: 'box', label: 'Box', icon: 'square', hint: 'Drag across the area to box it.' },
  { tool: 'measure', label: 'Measure', icon: 'ruler', hint: 'Drag from one end to the other, then type the size.' },
  { tool: 'number', label: 'Number', icon: '1.circle', hint: 'Tap each spot to number it.' },
];

const COLORS: MarkColor[] = ['red', 'yellow', 'white', 'black'];
const UNITS: [MeasureUnit, string][] = [
  ['inches', 'Inches'],
  ['feet', 'Feet'],
];

/** The tool, color and unit picked last, so the next photo starts with them. */
const kept: { tool: MarkTool; color: MarkColor; unit: MeasureUnit } = { tool: 'circle', color: 'red', unit: 'inches' };
const keep = (change: Partial<typeof kept>) => void Object.assign(kept, change);

/** How far a finger moves before a touch is a drag and not a tap, in points. */
const SLOP = 6;

/** The row sizes under the photo, so the More menu opens just above the tools. */
const LINE_HEIGHT = 40;
const TOOLS_HEIGHT = 58;
const COLORS_HEIGHT = 46;
const TOOL_WIDTH = 64;
const TOOL_GAP = 4;
const TOOLS_WIDTH = (MAIN.length + 1) * TOOL_WIDTH + MAIN.length * TOOL_GAP;

/** A square on a picked mark for a part that drags on its own, and the room around a picked mark's frame. */
const GRIP = 14;
const FRAME_PAD = 6;

/** What a finger on the photo does, from the moment it touches to the moment it lifts. */
interface Touch {
  grant: (e: GestureResponderEvent) => void;
  move: (e: GestureResponderEvent) => void;
  end: (lifted: boolean) => void;
}

/** A finger on the photo: pressed and not moved yet, drawing a new mark, or dragging the picked one or one of its squares. */
type Gesture =
  | { kind: 'press'; at: MarkPoint; x: number; y: number }
  | { kind: 'draw' }
  | { kind: 'move'; mark: Mark; from: MarkPoint; x: number; y: number; moved: boolean }
  | { kind: 'reshape'; mark: Mark; handle: MarkHandle; x: number; y: number; moved: boolean };

/** What the finger on a picked mark does, in a few words. */
function pickedHint(mark: Mark): string {
  switch (mark.tool) {
    case 'arrow':
    case 'measure':
      return 'Drag it, or drag an end.';
    case 'circle':
    case 'box':
      return 'Drag it, or drag a corner.';
    case 'text':
      return mark.to ? 'Drag the words or the tip.' : 'Drag to move it.';
    default:
      return 'Drag to move it.';
  }
}

export interface MarkupShot {
  uri: string;
  width: number;
  height: number;
  marks: Mark[];
}

export function MarkupEditor({
  shot,
  onRetake,
  onDone,
  retakeLabel = 'Retake',
  doneLabel = 'Next',
}: {
  shot: MarkupShot;
  onRetake: () => void;
  /** picture: the new picture when the photo was cropped, to take the place of the one it was made from. */
  onDone: (marks: Mark[], picture?: Picture) => void;
  retakeLabel?: string;
  doneLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const feedback = useFeedback();
  const { width: windowWidth } = useWindowDimensions();
  const [state, dispatch] = useReducer(markupReducer, shot.marks, (marks) => startMarkup(marks, kept.unit));
  const [tool, setTool] = useState<MarkTool>(kept.tool);
  const [color, setColor] = useState<MarkColor>(kept.color);
  // The tool's hint shows until a mark is drawn with it.
  const [since, setSince] = useState(shot.marks.length);
  const [more, setMore] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // The picture marked up: the photo as it came, or the one a crop made.
  const [picture, setPicture] = useState<Picture>({ uri: shot.uri, width: shot.width, height: shot.height });
  const [cropping, setCropping] = useState<PhotoCrop | null>(null);
  const [working, setWorking] = useState(false);
  const cropped = picture.uri !== shot.uri;

  const { marks, picked, panel } = state;
  const shown = fitPhoto(picture, box, 'contain');
  const aspect = picture.width / (picture.height || 1);
  const drawn = useMemo(() => shownMarks(state), [state]);
  const selected = pickedMark(state);
  const canUndo = state.past.length > 0 && !panel;
  const canRedo = state.future.length > 0 && !panel;
  const info = [...MAIN, ...MORE].find((t) => t.tool === tool) ?? MAIN[0]!;
  const extra = MORE.find((t) => t.tool === tool);
  const hint = marks.length <= since ? info.hint : 'Tap a mark to change it.';
  const bottom = Math.max(insets.bottom, 12);

  // What the finger reads, kept up to date after each render.
  const latest = useRef({ state, tool, color, width: shown.width, height: shown.height, aspect });
  useEffect(() => {
    latest.current = { state, tool, color, width: shown.width, height: shown.height, aspect };
  });

  // A touch on the picked mark drags it, and on one of its squares changes its shape. Anywhere else,
  // a drag draws a new mark and a tap picks the mark under the finger, puts down a numbered spot or
  // words to type, or lets go of the mark picked.
  const [touch] = useState<Touch>(() => {
    let g: Gesture | null = null;
    let origin = { x: 0, y: 0 };
    const pointAt = (x: number, y: number): MarkPoint => {
      const { width, height } = latest.current;
      return clampPoint([x / (width || 1), y / (height || 1)]);
    };
    // Measured from where the touch began, so a finger that leaves the photo still lines up.
    const here = (e: GestureResponderEvent) => pointAt(e.nativeEvent.pageX - origin.x, e.nativeEvent.pageY - origin.y);
    const far = (e: GestureResponderEvent, x: number, y: number) => Math.hypot(e.nativeEvent.pageX - x, e.nativeEvent.pageY - y) >= SLOP;

    const tapped = (p: MarkPoint) => {
      const { state: s, tool: t, color: c, width, height } = latest.current;
      if (s.picked !== null) {
        // Another mark under the finger is picked instead; anywhere else lets go of the one picked.
        const i = markAt(s.marks, p, width, height);
        if (i >= 0) haptic.selection();
        dispatch({ type: 'pick', index: i >= 0 ? i : null });
        return;
      }
      // A tap on a mark picks it. Anywhere else, inside a circle or a box too, it puts a number down
      // with Number, and with every other tool it puts words there to type: tap and type.
      const i = markAt(s.marks, p, width, height, 22, { inside: false });
      if (i >= 0) {
        haptic.selection();
        dispatch({ type: 'pick', index: i });
      } else if (t === 'number') {
        haptic.selection();
        dispatch({ type: 'place', mark: newMark('number', c, p, p, s.marks) });
      } else {
        dispatch({ type: 'note', at: p, color: c });
      }
    };

    const end = (lifted: boolean) => {
      const was = g;
      g = null;
      if (!was) return;
      if (was.kind === 'press') {
        if (lifted) tapped(was.at);
      } else if (was.kind === 'draw') {
        haptic.selection();
        dispatch({ type: 'drop', aspect: latest.current.aspect });
      } else if (was.kind === 'move' && !was.moved && lifted && (was.mark.tool === 'text' || was.mark.tool === 'measure')) {
        // A second tap on a picked note or measurement opens its words.
        dispatch({ type: 'edit' });
      } else {
        dispatch({ type: 'changed' });
      }
    };

    return {
      grant: (e) => {
        const { pageX, pageY, locationX, locationY } = e.nativeEvent;
        origin = { x: pageX - locationX, y: pageY - locationY };
        const { state: s, width, height } = latest.current;
        g = null;
        if (s.panel) return;
        const p = pointAt(locationX, locationY);
        const m = s.picked === null ? undefined : s.marks[s.picked];
        if (m) {
          const handle = handleAt(m, p, width, height);
          if (handle) {
            g = { kind: 'reshape', mark: m, handle, x: pageX, y: pageY, moved: false };
            return;
          }
          if (markAt([m], p, width, height) === 0) {
            g = { kind: 'move', mark: m, from: p, x: pageX, y: pageY, moved: false };
            return;
          }
        }
        g = { kind: 'press', at: p, x: pageX, y: pageY };
      },
      move: (e) => {
        if (!g) return;
        const p = here(e);
        if (g.kind === 'press') {
          if (!far(e, g.x, g.y)) return;
          const { state: s, tool: t, color: c } = latest.current;
          dispatch({ type: 'start', mark: newMark(t, c, g.at, p, s.marks) });
          g = { kind: 'draw' };
        } else if (g.kind === 'draw') {
          dispatch({ type: 'move', at: p });
        } else {
          if (!g.moved && !far(e, g.x, g.y)) return;
          g.moved = true;
          const mark = g.kind === 'move' ? moveMark(g.mark, p[0] - g.from[0], p[1] - g.from[1]) : moveHandle(g.mark, g.handle, p);
          dispatch({ type: 'change', mark });
        }
      },
      end,
    };
  });

  const pickTool = (t: MarkTool) => {
    haptic.selection();
    setMore(false);
    setTool(t);
    keep({ tool: t });
    setSince(marks.length);
    if (picked !== null) dispatch({ type: 'pick', index: null });
  };
  const pickColor = (c: MarkColor) => {
    haptic.selection();
    setColor(c);
    keep({ color: c });
    if (picked !== null) dispatch({ type: 'recolor', color: c });
  };
  const add = (text?: string) => {
    haptic.selection();
    dispatch({ type: 'add', text });
  };
  const cancel = () => dispatch({ type: 'cancel' });
  // Words still open go on with the rest.
  const finish = () => onDone(markupReducer(state, { type: 'add' }).marks, cropped ? picture : undefined);
  const retake = () => leaveOrConfirm(cropped || !sameMarks(marks, shot.marks), feedback, onRetake, 'this photo');
  const startCrop = () => {
    haptic.selection();
    setMore(false);
    if (picked !== null) dispatch({ type: 'pick', index: null });
    setCropping(NO_CROP);
  };
  // The new picture is made, and the marks move with it.
  const applyCrop = async () => {
    const crop = cropping;
    if (!crop || working) return;
    if (isNoCrop(crop)) {
      setCropping(null);
      return;
    }
    setWorking(true);
    try {
      const next = await cropPicture(picture.uri, crop);
      dispatch({ type: 'cropped', marks: croppedMarks(markupReducer(state, { type: 'add' }).marks, picture.width, picture.height, crop) });
      setPicture(next);
      setCropping(null);
      haptic.success();
    } catch (e) {
      console.warn('Cropping the photo', e);
      haptic.warning();
      feedback.toast({ message: 'The photo could not be cropped. Try again.' });
    } finally {
      setWorking(false);
    }
  };
  const inkShown = selected?.color ?? color;

  if (cropping) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]} testID="markup-cropping">
        <View style={styles.bar}>
          <Touchable feedback="opacity" onPress={() => setCropping(null)} disabled={working} accessibilityRole="button" testID="crop-cancel" style={styles.barSide}>
            <Text variant="button" color={colors.onDark}>
              Cancel
            </Text>
          </Touchable>
          <Text variant="button" color={colors.onDark}>
            Crop
          </Text>
          <View style={[styles.barSide, styles.barRight]}>
            <Touchable feedback="opacity" onPress={() => void applyCrop()} disabled={working} accessibilityRole="button" testID="crop-done" style={styles.next}>
              {working ? (
                <ActivityIndicator size="small" color={colors.bar} />
              ) : (
                <Text variant="button" weight="600" color={colors.bar}>
                  Done
                </Text>
              )}
            </Touchable>
          </View>
        </View>
        <View style={styles.area} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {box.width > 0 ? <CropFrame picture={picture} marks={drawn} crop={cropping} onCrop={setCropping} area={box} /> : null}
        </View>
        <View style={styles.line}>
          <Text variant="footnote" color={colors.onDarkQuiet} align="center" numberOfLines={1} style={styles.lineText} testID="crop-hint">
            Drag a corner of the box, or its middle to move it.
          </Text>
        </View>
        <CropControls crop={cropping} onCrop={setCropping} bottom={bottom} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { paddingTop: insets.top }]} testID="markup">
      <View style={styles.bar}>
        <Touchable feedback="opacity" onPress={retake} accessibilityRole="button" testID="markup-retake" style={styles.barSide}>
          <Text variant="button" color={colors.onDark}>
            {retakeLabel}
          </Text>
        </Touchable>
        <View style={styles.history}>
          <Touchable
            feedback="opacity"
            onPress={() => {
              haptic.selection();
              dispatch({ type: 'undo' });
            }}
            disabled={!canUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            testID="markup-undo"
            style={[styles.barIcon, canUndo ? null : styles.off]}
          >
            <Icon name="undo" size={21} color={colors.onDark} />
          </Touchable>
          <Touchable
            feedback="opacity"
            onPress={() => {
              haptic.selection();
              dispatch({ type: 'redo' });
            }}
            disabled={!canRedo}
            accessibilityRole="button"
            accessibilityLabel="Redo"
            testID="markup-redo"
            style={[styles.barIcon, canRedo ? null : styles.off]}
          >
            <Icon name="redo" size={21} color={colors.onDark} />
          </Touchable>
        </View>
        <View style={[styles.barSide, styles.barRight]}>
          <Touchable feedback="opacity" onPress={finish} accessibilityRole="button" testID="markup-next" style={styles.next}>
            <Text variant="button" weight="600" color={colors.bar}>
              {doneLabel}
            </Text>
          </Touchable>
        </View>
      </View>

      <View style={styles.area} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {box.width > 0 ? (
          <View style={{ position: 'absolute', left: shown.left, top: shown.top, width: shown.width, height: shown.height }}>
            <Image source={{ uri: picture.uri }} style={{ width: shown.width, height: shown.height }} contentFit="fill" accessibilityIgnoresInvertColors testID="markup-photo" />
            <MarkLayer marks={drawn} width={shown.width} height={shown.height} />
            {selected ? <Picked mark={selected} width={shown.width} height={shown.height} /> : null}
            <Canvas touch={touch} />
          </View>
        ) : null}
      </View>

      {panel?.kind === 'note' ? (
        <View style={styles.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            {QUICK_NOTES.map((word) => (
              <Touchable
                key={word}
                feedback="opacity"
                onPress={() => add(word)}
                accessibilityRole="button"
                testID={`quick-${word.toLowerCase().replace(/ /g, '-')}`}
                style={styles.chip}
              >
                <Text variant="subheadline" weight="600" color={colors.onDark}>
                  {word}
                </Text>
              </Touchable>
            ))}
          </ScrollView>
          <View style={styles.entry}>
            <TextInput
              value={panel.draft.text}
              onChangeText={(text) => dispatch({ type: 'type', text })}
              onSubmitEditing={() => add()}
              placeholder={panel.draft.to ? 'What is wrong there?' : 'Or type your own'}
              placeholderTextColor={colors.onDarkQuiet}
              selectionColor={colors.onDark}
              autoFocus
              autoCapitalize="sentences"
              returnKeyType="done"
              maxLength={40}
              maxFontSizeMultiplier={TEXT_LARGEST}
              accessibilityLabel="Words on the photo"
              testID="markup-note"
              style={styles.input}
            />
            <Touchable feedback="opacity" onPress={cancel} accessibilityRole="button" testID="markup-note-cancel" style={styles.panelButton}>
              <Text color={colors.onDarkQuiet}>Cancel</Text>
            </Touchable>
            <Touchable feedback="opacity" onPress={() => add()} accessibilityRole="button" testID="markup-note-add" style={styles.panelButton}>
              <Text weight="600" color={colors.onDark}>
                {panel.index === null ? 'Add' : 'Save'}
              </Text>
            </Touchable>
          </View>
        </View>
      ) : panel?.kind === 'size' ? (
        <View style={styles.panel}>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Unit">
            {UNITS.map(([unit, label]) => (
              <Touchable
                key={unit}
                feedback="opacity"
                onPress={() => {
                  haptic.selection();
                  keep({ unit });
                  dispatch({ type: 'unit', unit });
                }}
                accessibilityRole="radio"
                aria-checked={panel.unit === unit}
                testID={`unit-${unit}`}
                style={[styles.chip, panel.unit === unit ? styles.chipOn : null]}
              >
                <Text variant="subheadline" weight="600" color={panel.unit === unit ? colors.label : colors.onDark}>
                  {label}
                </Text>
              </Touchable>
            ))}
          </View>
          <View style={styles.entry}>
            <TextInput
              value={panel.text}
              onChangeText={(text) => dispatch({ type: 'type', text })}
              onSubmitEditing={() => add()}
              placeholder={`Size, like 24 or 2'6"`}
              placeholderTextColor={colors.onDarkQuiet}
              selectionColor={colors.onDark}
              autoFocus
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              maxLength={24}
              maxFontSizeMultiplier={TEXT_LARGEST}
              accessibilityLabel="Size"
              testID="markup-size"
              style={styles.input}
            />
            <Touchable feedback="opacity" onPress={cancel} accessibilityRole="button" testID="markup-size-cancel" style={styles.panelButton}>
              <Text color={colors.onDarkQuiet}>Cancel</Text>
            </Touchable>
            <Touchable feedback="opacity" onPress={() => add()} accessibilityRole="button" testID="markup-size-add" style={styles.panelButton}>
              <Text weight="600" color={colors.onDark}>
                {panel.index === null ? 'Add' : 'Save'}
              </Text>
            </Touchable>
          </View>
        </View>
      ) : (
        <View style={[styles.controls, { paddingBottom: bottom }]}>
          <View style={styles.line}>
            {selected ? (
              <>
                <Text variant="footnote" color={colors.onDarkQuiet} numberOfLines={1} style={styles.lineText} testID="markup-hint">
                  {pickedHint(selected)}
                </Text>
                {selected.tool === 'text' || selected.tool === 'measure' ? (
                  <LineButton label={selected.tool === 'text' ? 'Edit Words' : 'Edit Size'} onPress={() => dispatch({ type: 'edit' })} testID="markup-edit" />
                ) : null}
                <LineButton
                  label="Delete"
                  onPress={() => {
                    haptic.heavy();
                    dispatch({ type: 'remove' });
                  }}
                  testID="markup-delete"
                />
              </>
            ) : (
              <Text variant="footnote" color={colors.onDarkQuiet} align="center" numberOfLines={1} style={styles.lineText} testID="markup-hint">
                {hint}
              </Text>
            )}
          </View>
          <View style={styles.tools} accessibilityRole="toolbar">
            {MAIN.map((t) => (
              <ToolButton key={t.tool} label={t.label} icon={t.icon} on={tool === t.tool} onPress={() => pickTool(t.tool)} testID={`tool-${t.tool}`} />
            ))}
            <ToolButton
              label={extra?.label ?? 'More'}
              icon={extra?.icon ?? 'ellipsis'}
              on={!!extra}
              onPress={() => {
                haptic.selection();
                setMore(true);
              }}
              testID="tool-more"
            />
          </View>
          <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel={selected ? 'Color of the mark' : 'Ink color'}>
            {COLORS.map((c) => (
              <Touchable
                key={c}
                feedback="opacity"
                onPress={() => pickColor(c)}
                accessibilityRole="radio"
                accessibilityLabel={MARK_COLOR_NAMES[c]}
                aria-checked={inkShown === c}
                testID={`color-${c}`}
                style={styles.swatchHit}
              >
                <View style={[styles.swatch, { backgroundColor: MARK_COLORS[c] }, c === 'black' ? styles.swatchBlack : null, inkShown === c ? styles.swatchOn : null]} />
              </Touchable>
            ))}
          </View>
        </View>
      )}

      {more ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Close the menu" testID="markup-more-close" />
          <View
            style={[styles.morePanel, { right: Math.max(8, (windowWidth - TOOLS_WIDTH) / 2), bottom: bottom + COLORS_HEIGHT + TOOLS_HEIGHT + 6 }]}
            accessibilityRole="menu"
            accessibilityLabel="More tools"
          >
            {MORE.map((t, i) => (
              <Touchable
                key={t.tool}
                feedback="opacity"
                onPress={() => pickTool(t.tool)}
                accessibilityRole="menuitem"
                aria-checked={tool === t.tool}
                testID={`tool-${t.tool}`}
                style={[styles.moreRow, i > 0 ? styles.moreRule : null]}
              >
                <View style={styles.moreCheck}>{tool === t.tool ? <Icon name="checkmark" size={15} color={colors.onDark} weight="semibold" /> : null}</View>
                <Text variant="body" color={colors.onDark} style={styles.moreLabel}>
                  {t.label}
                </Text>
                <Icon name={t.icon} size={20} color={colors.onDark} />
              </Touchable>
            ))}
            <Touchable feedback="opacity" onPress={startCrop} accessibilityRole="menuitem" testID="markup-crop" style={[styles.moreRow, styles.moreRule]}>
              <View style={styles.moreCheck} />
              <Text variant="body" color={colors.onDark} style={styles.moreLabel}>
                Crop and Straighten
              </Text>
              <Icon name="crop" size={20} color={colors.onDark} />
            </Touchable>
          </View>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** The photo's touch surface, over the marks. */
function Canvas({ touch }: { touch: Touch }) {
  const [handlers] = useState(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => touch.grant(e),
        onPanResponderMove: (e) => touch.move(e),
        onPanResponderRelease: () => touch.end(true),
        onPanResponderTerminate: () => touch.end(false),
      }).panHandlers,
  );
  return <View {...handlers} style={[styles.canvas, WEB_CANVAS]} testID="markup-canvas" accessibilityLabel="Draw on the photo" />;
}

function ToolButton({ label, icon, on, onPress, testID }: { label: string; icon: IconName; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={on}
      testID={testID}
      style={[styles.tool, on ? styles.toolOn : null]}
    >
      <Icon name={icon} size={22} color={colors.onDark} weight={on ? 'medium' : 'regular'} />
      <Text variant="stamp" color={on ? colors.onDark : colors.onDarkQuiet} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

function LineButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Touchable feedback="opacity" onPress={onPress} accessibilityRole="button" testID={testID} style={styles.lineButton}>
      <Text variant="button" color={colors.onDark}>
        {label}
      </Text>
    </Touchable>
  );
}

/** The picked mark: a dashed frame around it and a square on each part that drags on its own. */
function Picked({ mark, width, height }: { mark: Mark; width: number; height: number }) {
  const px = ([x, y]: MarkPoint): [number, number] => [x * width, y * height];
  let frame: { x: number; y: number; width: number; height: number } | null = null;
  if (mark.tool === 'circle' || mark.tool === 'box') {
    const [a, b] = [px(mark.from), px(mark.to)];
    frame = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
  } else if (mark.tool !== 'arrow' && mark.tool !== 'measure') {
    // The words of a note that points, which drag on their own; a line, a spot or plain words whole.
    const f = markFrame(mark.tool === 'text' ? { tool: 'text', color: mark.color, at: mark.at, text: mark.text } : mark, width, height);
    frame = { x: f.x - FRAME_PAD, y: f.y - FRAME_PAD, width: f.width + 2 * FRAME_PAD, height: f.height + 2 * FRAME_PAD };
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="markup-picked">
      {frame ? (
        <View style={[styles.frame, { left: frame.x, top: frame.y, width: frame.width, height: frame.height }]}>
          <View style={styles.frameDash} />
        </View>
      ) : null}
      {markHandles(mark).map(({ handle, at }) => {
        const [x, y] = px(at);
        return <View key={handle} style={[styles.grip, { left: x - GRIP / 2, top: y - GRIP / 2 }]} />;
      })}
    </View>
  );
}

// On the preview page a drag on the photo draws instead of selecting or scrolling the page.
const WEB_CANVAS = Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'crosshair' } as object) : null;


/** The edge of a square control on the dark photo. */
const EDGE = 'rgba(247, 245, 236, 0.22)';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bar },
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  barSide: { flex: 1, height: 44, justifyContent: 'center' },
  barRight: { alignItems: 'flex-end' },
  history: { flexDirection: 'row', gap: 4 },
  barIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  next: { height: 36, paddingHorizontal: 14, backgroundColor: colors.onDark, alignItems: 'center', justifyContent: 'center' },
  area: { flex: 1 },
  canvas: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  controls: { paddingTop: 2 },
  line: { height: LINE_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  lineText: { flex: 1 },
  lineButton: { height: 32, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: EDGE },
  tools: { height: TOOLS_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: TOOL_GAP },
  tool: { width: TOOL_WIDTH, height: 54, alignItems: 'center', justifyContent: 'center', gap: 4 },
  toolOn: { backgroundColor: colors.darkChipOn },
  colors: { height: COLORS_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  swatchHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 26, height: 26 },
  swatchBlack: { borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.5)' },
  swatchOn: { borderWidth: 2.5, borderColor: colors.black, outlineWidth: 2, outlineColor: colors.white, outlineStyle: 'solid' },
  frame: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(19, 32, 40, 0.6)' },
  frameDash: { position: 'absolute', left: -1, top: -1, right: -1, bottom: -1, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.white },
  grip: { position: 'absolute', width: GRIP, height: GRIP, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.bar, boxShadow: '0 1px 3px rgba(0, 0, 0, 0.45)' },
  panel: { gap: 10, paddingTop: 12, paddingBottom: 12, backgroundColor: '#1C1C1E' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  chip: { height: 36, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: EDGE },
  chipOn: { backgroundColor: colors.white },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  input: { ...fieldFont('body'), flex: 1, minWidth: 0, height: 44, paddingHorizontal: 12, color: colors.onDark, backgroundColor: colors.darkChip, borderWidth: 1, borderColor: EDGE, outlineWidth: 0 },
  panelButton: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
  morePanel: { position: 'absolute', width: 220, backgroundColor: colors.bar, borderWidth: 1, borderColor: EDGE, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)' },
  moreRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  moreRule: { borderTopWidth: 1, borderTopColor: 'rgba(247, 245, 236, 0.12)' },
  moreCheck: { width: 16, alignItems: 'center' },
  moreLabel: { flex: 1 },
});
