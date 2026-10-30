// Markup on a photo, made for the job site and laid out like Apple's Markup: draw, arrow, circle,
// box, a measurement with its size written out, numbered spots for several places with the same
// work, and a short note with the standard words one tap away. Red, yellow, white or black, with
// Undo. A line under the photo says how to use the tool picked. Words and numbers carry an outline
// so they read on any wall. Next keeps the photo as it is when nothing was drawn. The marks are kept
// apart from the picture, so the original is never changed.

import {
  addPenPoint,
  clampPoint,
  isTooSmall,
  MARK_COLOR_NAMES,
  MARK_COLORS,
  measureText,
  nextNumber,
  QUICK_NOTES,
  tidyTitle,
  type Mark,
  type MarkColor,
  type MarkPoint,
  type MarkTool,
  type MeasureUnit,
} from '@punch/core';
import { Image } from 'expo-image';
import { useMemo, useReducer, useState } from 'react';
import { KeyboardAvoidingView, PanResponder, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type as typeScale } from '@/constants/theme';
import { fitPhoto, haptic, Icon, MarkLayer, Text, Touchable, type IconName } from '@/ui';

const TOOLS: { tool: MarkTool; label: string; icon: IconName; hint: string }[] = [
  { tool: 'pen', label: 'Draw', icon: 'pencil.tip', hint: 'Draw with your finger.' },
  { tool: 'arrow', label: 'Arrow', icon: 'arrow.up.right', hint: 'Drag toward the spot.' },
  { tool: 'circle', label: 'Circle', icon: 'circle', hint: 'Drag across the area to circle it.' },
  { tool: 'box', label: 'Box', icon: 'square', hint: 'Drag across the area to box it.' },
  { tool: 'measure', label: 'Measure', icon: 'ruler', hint: 'Drag from one end to the other, then type the size.' },
  { tool: 'number', label: 'Number', icon: '1.circle', hint: 'Tap each spot to number it.' },
  { tool: 'text', label: 'Note', icon: 'textformat', hint: 'Tap where the note goes.' },
];

const COLORS: MarkColor[] = ['red', 'yellow', 'white', 'black'];
const UNITS: [MeasureUnit, string][] = [
  ['inches', 'Inches'],
  ['feet', 'Feet'],
];

/** The box open under the photo: a note being written, or the size of the measurement just drawn. */
type Panel = { kind: 'note'; at: MarkPoint; color: MarkColor; text: string } | { kind: 'size'; text: string; unit: MeasureUnit };

interface Drawing {
  marks: Mark[];
  /** The mark under the finger, kept once the finger lifts unless it was only a tap. */
  drawing: Mark | null;
  panel: Panel | null;
  /** The unit picked last, so the next measurement starts with it. */
  unit: MeasureUnit;
}

type Action =
  | { type: 'start'; tool: MarkTool; color: MarkColor; at: MarkPoint }
  | { type: 'move'; at: MarkPoint }
  | { type: 'end'; aspect: number }
  | { type: 'type'; text: string }
  | { type: 'unit'; unit: MeasureUnit }
  | { type: 'add'; text?: string }
  | { type: 'cancel' }
  | { type: 'undo' };

/** The size typed so far, written out on the measurement as it is typed. */
function withSize(s: Drawing, panel: Extract<Panel, { kind: 'size' }>): Drawing {
  const last = s.marks[s.marks.length - 1];
  if (last?.tool !== 'measure') return { ...s, panel };
  return { ...s, panel, marks: [...s.marks.slice(0, -1), { ...last, text: measureText(panel.text, panel.unit) }] };
}

function draw(s: Drawing, a: Action): Drawing {
  const { panel } = s;
  switch (a.type) {
    case 'start': {
      if (panel) return s;
      if (a.tool === 'text') return { ...s, panel: { kind: 'note', at: a.at, color: a.color, text: '' } };
      if (a.tool === 'number') return { ...s, marks: [...s.marks, { tool: 'number', color: a.color, at: a.at, n: nextNumber(s.marks) }] };
      const drawing: Mark =
        a.tool === 'pen'
          ? { tool: 'pen', color: a.color, points: [a.at] }
          : a.tool === 'measure'
            ? { tool: 'measure', color: a.color, from: a.at, to: a.at, text: '' }
            : { tool: a.tool, color: a.color, from: a.at, to: a.at };
      return { ...s, drawing };
    }
    case 'move': {
      const d = s.drawing;
      if (!d) return s;
      if (d.tool === 'pen') return { ...s, drawing: { ...d, points: addPenPoint(d.points, a.at) } };
      if ('to' in d) return { ...s, drawing: { ...d, to: a.at } };
      return s;
    }
    case 'end': {
      const d = s.drawing;
      if (!d) return s;
      if (isTooSmall(d, a.aspect)) return { ...s, drawing: null };
      // A measurement asks for its size straight away.
      return { ...s, marks: [...s.marks, d], drawing: null, panel: d.tool === 'measure' ? { kind: 'size', text: '', unit: s.unit } : panel };
    }
    case 'type':
      if (panel?.kind === 'note') return { ...s, panel: { ...panel, text: a.text } };
      if (panel?.kind === 'size') return withSize(s, { ...panel, text: a.text });
      return s;
    case 'unit':
      return panel?.kind === 'size' ? withSize({ ...s, unit: a.unit }, { ...panel, unit: a.unit }) : s;
    case 'add': {
      if (panel?.kind !== 'note') return { ...s, panel: null };
      const text = tidyTitle(a.text ?? panel.text);
      return { ...s, panel: null, marks: text ? [...s.marks, { tool: 'text', color: panel.color, at: panel.at, text }] : s.marks };
    }
    case 'cancel':
      // A measurement still waiting for its size goes too.
      return { ...s, panel: null, marks: panel?.kind === 'size' ? s.marks.slice(0, -1) : s.marks };
    case 'undo':
      return panel ? s : { ...s, marks: s.marks.slice(0, -1) };
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
  onDone: (marks: Mark[]) => void;
  retakeLabel?: string;
  doneLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [{ marks, drawing, panel }, dispatch] = useReducer(draw, { marks: shot.marks, drawing: null, panel: null, unit: 'inches' });
  const [tool, setTool] = useState<MarkTool>('arrow');
  const [color, setColor] = useState<MarkColor>('red');
  const [box, setBox] = useState({ width: 0, height: 0 });

  const shown = fitPhoto(shot, box, 'contain');
  const aspect = shot.width / (shot.height || 1);
  const hint = TOOLS.find((t) => t.tool === tool)?.hint;

  // A touch starts a mark, a drag shapes it, and lifting the finger keeps it unless it was only a
  // tap. Numbered spots and notes go where the finger touches.
  const responder = useMemo(() => {
    const at = (x: number, y: number): MarkPoint => clampPoint([x / (shown.width || 1), y / (shown.height || 1)]);
    const end = () => dispatch({ type: 'end', aspect });
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        if (tool === 'number') haptic.selection();
        dispatch({ type: 'start', tool, color, at: at(e.nativeEvent.locationX, e.nativeEvent.locationY) });
      },
      onPanResponderMove: (e) => dispatch({ type: 'move', at: at(e.nativeEvent.locationX, e.nativeEvent.locationY) }),
      onPanResponderRelease: () => {
        if (tool !== 'number' && tool !== 'text') haptic.selection();
        end();
      },
      onPanResponderTerminate: end,
    });
  }, [tool, color, shown.width, shown.height, aspect]);

  const add = (text?: string) => {
    haptic.selection();
    dispatch({ type: 'add', text });
  };
  const cancel = () => dispatch({ type: 'cancel' });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { paddingTop: insets.top }]} testID="markup">
      <View style={styles.bar}>
        <Touchable feedback="opacity" onPress={onRetake} accessibilityRole="button" testID="markup-retake" style={styles.barSide}>
          <Text color={colors.onDark}>{retakeLabel}</Text>
        </Touchable>
        <Text variant="headline" color={colors.onDark} accessibilityRole="header">
          Mark Up
        </Text>
        <View style={[styles.barSide, styles.barRight]}>
          <Touchable feedback="scale" onPress={() => onDone(marks)} accessibilityRole="button" testID="markup-next" style={styles.next}>
            <Text variant="subheadline" weight="600" color={colors.label}>
              {doneLabel}
            </Text>
          </Touchable>
        </View>
      </View>

      <View style={styles.area} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {box.width > 0 ? (
          <View style={{ position: 'absolute', left: shown.left, top: shown.top, width: shown.width, height: shown.height }}>
            <Image source={{ uri: shot.uri }} style={{ width: shown.width, height: shown.height }} contentFit="fill" accessibilityIgnoresInvertColors />
            <MarkLayer marks={drawing ? [...marks, drawing] : marks} width={shown.width} height={shown.height} />
            <View {...responder.panHandlers} style={styles.canvas} testID="markup-canvas" accessibilityLabel="Draw on the photo" />
          </View>
        ) : null}
      </View>

      {panel?.kind === 'note' ? (
        <View style={styles.panel}>
          <View style={styles.chips}>
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
          </View>
          <View style={styles.entry}>
            <TextInput
              value={panel.text}
              onChangeText={(text) => dispatch({ type: 'type', text })}
              onSubmitEditing={() => add()}
              placeholder="Or type a short note"
              placeholderTextColor={colors.onDarkQuiet}
              selectionColor={colors.onDark}
              autoFocus
              autoCapitalize="sentences"
              returnKeyType="done"
              maxLength={40}
              accessibilityLabel="Note"
              testID="markup-note"
              style={styles.input}
            />
            <Touchable feedback="opacity" onPress={cancel} accessibilityRole="button" testID="markup-note-cancel" style={styles.panelButton}>
              <Text color={colors.onDarkQuiet}>Cancel</Text>
            </Touchable>
            <Touchable feedback="opacity" onPress={() => add()} accessibilityRole="button" testID="markup-note-add" style={styles.panelButton}>
              <Text weight="600" color={colors.onDark}>
                Add
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
                  dispatch({ type: 'unit', unit });
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: panel.unit === unit }}
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
              accessibilityLabel="Size"
              testID="markup-size"
              style={styles.input}
            />
            <Touchable feedback="opacity" onPress={cancel} accessibilityRole="button" testID="markup-size-cancel" style={styles.panelButton}>
              <Text color={colors.onDarkQuiet}>Cancel</Text>
            </Touchable>
            <Touchable feedback="opacity" onPress={() => add()} accessibilityRole="button" testID="markup-size-add" style={styles.panelButton}>
              <Text weight="600" color={colors.onDark}>
                Add
              </Text>
            </Touchable>
          </View>
        </View>
      ) : (
        <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text variant="footnote" color={colors.onDarkQuiet} align="center" numberOfLines={1} testID="markup-hint">
            {hint}
          </Text>
          <View style={styles.tools} accessibilityRole="toolbar">
            {TOOLS.map((t) => (
              <Touchable
                key={t.tool}
                feedback="opacity"
                onPress={() => {
                  haptic.selection();
                  setTool(t.tool);
                }}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: tool === t.tool }}
                testID={`tool-${t.tool}`}
                style={[styles.tool, tool === t.tool ? styles.toolOn : null]}
              >
                <Icon name={t.icon} size={22} color={colors.onDark} />
              </Touchable>
            ))}
          </View>
          <View style={styles.colors}>
            <View style={styles.colorSet} accessibilityRole="radiogroup" accessibilityLabel="Ink color">
              {COLORS.map((c) => (
                <Touchable
                  key={c}
                  feedback="scale"
                  onPress={() => {
                    haptic.selection();
                    setColor(c);
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={MARK_COLOR_NAMES[c]}
                  accessibilityState={{ checked: color === c }}
                  testID={`color-${c}`}
                  style={styles.swatchHit}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: MARK_COLORS[c] },
                      c === 'black' ? styles.swatchBlack : null,
                      color === c ? styles.swatchOn : null,
                    ]}
                  />
                </Touchable>
              ))}
            </View>
            <View style={styles.rule} />
            <Touchable
              feedback="opacity"
              onPress={() => dispatch({ type: 'undo' })}
              disabled={marks.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Undo"
              testID="markup-undo"
              style={[styles.tool, marks.length === 0 ? { opacity: 0.35 } : null]}
            >
              <Icon name="undo" size={22} color={colors.onDark} />
            </Touchable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  bar: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  barSide: { flex: 1, height: 44, justifyContent: 'center' },
  barRight: { alignItems: 'flex-end' },
  next: { height: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  area: { flex: 1 },
  canvas: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  controls: { paddingTop: 10, gap: 6 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  tool: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: colors.darkChipOn },
  colors: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  colorSet: { flexDirection: 'row', gap: 6 },
  rule: { width: 1, height: 26, marginHorizontal: 12, backgroundColor: 'rgba(255, 255, 255, 0.24)' },
  swatchHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchBlack: { borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.5)' },
  swatchOn: { borderWidth: 2.5, borderColor: colors.black, outlineWidth: 2, outlineColor: colors.white, outlineStyle: 'solid' },
  panel: { gap: 10, paddingTop: 12, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#1C1C1E' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: colors.darkChip },
  chipOn: { backgroundColor: colors.white },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { ...typeScale.body, flex: 1, minWidth: 0, height: 44, paddingHorizontal: 14, borderRadius: 12, color: colors.onDark, backgroundColor: colors.darkChip, outlineWidth: 0 },
  panelButton: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
});
