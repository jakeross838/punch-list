// Markup on a photo, like Apple's Markup: draw, arrow, circle, box and a short note, in red, yellow,
// white or black, with Undo. Next keeps the photo as it is when nothing was drawn. The marks are
// kept apart from the picture, so the original is never changed.

import {
  addPenPoint,
  clampPoint,
  isTooSmall,
  MARK_COLOR_NAMES,
  MARK_COLORS,
  tidyTitle,
  type Mark,
  type MarkColor,
  type MarkPoint,
  type MarkTool,
} from '@punch/core';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { PanResponder, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, type as typeScale } from '@/constants/theme';
import { fitPhoto, haptic, Icon, MarkLayer, Text, Touchable, type IconName } from '@/ui';

const TOOLS: { tool: MarkTool; label: string; icon: IconName }[] = [
  { tool: 'pen', label: 'Draw', icon: 'pencil.tip' },
  { tool: 'arrow', label: 'Arrow', icon: 'arrow.up.right' },
  { tool: 'circle', label: 'Circle', icon: 'circle' },
  { tool: 'box', label: 'Box', icon: 'square' },
  { tool: 'text', label: 'Note', icon: 'textformat' },
];

const COLORS: MarkColor[] = ['red', 'yellow', 'white', 'black'];

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
  const [marks, setMarks] = useState<Mark[]>(shot.marks);
  const [tool, setTool] = useState<MarkTool>('arrow');
  const [color, setColor] = useState<MarkColor>('red');
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [noteAt, setNoteAt] = useState<MarkPoint | null>(null);
  const [note, setNote] = useState('');

  const shown = fitPhoto(shot, box, 'contain');
  const aspect = shot.width / (shot.height || 1);

  // The mark being drawn is always the last one: a touch adds it, a drag reshapes it, and lifting
  // the finger keeps it unless it was only a tap.
  const responder = useMemo(() => {
    const at = (x: number, y: number): MarkPoint => clampPoint([x / (shown.width || 1), y / (shown.height || 1)]);
    const reshape = (mark: Mark, p: MarkPoint): Mark =>
      mark.tool === 'pen' ? { ...mark, points: addPenPoint(mark.points, p) } : mark.tool === 'text' ? mark : { ...mark, to: p };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const p = at(e.nativeEvent.locationX, e.nativeEvent.locationY);
        if (tool === 'text') {
          setNote('');
          setNoteAt(p);
          return;
        }
        const mark: Mark = tool === 'pen' ? { tool, color, points: [p] } : { tool, color, from: p, to: p };
        setMarks((m) => [...m, mark]);
      },
      onPanResponderMove: (e) => {
        if (tool === 'text') return;
        const p = at(e.nativeEvent.locationX, e.nativeEvent.locationY);
        setMarks((m) => {
          const last = m[m.length - 1];
          return last && last.tool !== 'text' ? [...m.slice(0, -1), reshape(last, p)] : m;
        });
      },
      onPanResponderRelease: () => {
        if (tool === 'text') return;
        haptic.selection();
        setMarks((m) => {
          const last = m[m.length - 1];
          return last && last.tool !== 'text' && isTooSmall(last, aspect) ? m.slice(0, -1) : m;
        });
      },
    });
  }, [tool, color, shown.width, shown.height, aspect]);

  function addNote() {
    const text = tidyTitle(note);
    if (noteAt && text) setMarks((m) => [...m, { tool: 'text', color, at: noteAt, text }]);
    setNoteAt(null);
    setNote('');
  }


  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="markup">
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
            <MarkLayer marks={marks} width={shown.width} height={shown.height} />
            <View {...responder.panHandlers} style={styles.canvas} testID="markup-canvas" accessibilityLabel="Draw on the photo" />
          </View>
        ) : null}
      </View>

      <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
              <Icon name={t.icon} size={23} color={colors.onDark} />
            </Touchable>
          ))}
          <View style={styles.rule} />
          <Touchable
            feedback="opacity"
            onPress={() => setMarks((m) => m.slice(0, -1))}
            disabled={marks.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            testID="markup-undo"
            style={[styles.tool, marks.length === 0 ? { opacity: 0.35 } : null]}
          >
            <Icon name="undo" size={22} color={colors.onDark} />
          </Touchable>
        </View>
        <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="Ink color">
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
      </View>

      {noteAt ? (
        <View style={[styles.note, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TextInput
            value={note}
            onChangeText={setNote}
            onSubmitEditing={addNote}
            placeholder="Type a short note"
            placeholderTextColor={colors.onDarkQuiet}
            selectionColor={colors.onDark}
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
            maxLength={40}
            accessibilityLabel="Note"
            testID="markup-note"
            style={styles.noteInput}
          />
          <Touchable feedback="opacity" onPress={() => setNoteAt(null)} accessibilityRole="button" style={styles.noteButton}>
            <Text color={colors.onDarkQuiet}>Cancel</Text>
          </Touchable>
          <Touchable feedback="opacity" onPress={addNote} accessibilityRole="button" testID="markup-note-add" style={styles.noteButton}>
            <Text weight="600" color={colors.onDark}>
              Add
            </Text>
          </Touchable>
        </View>
      ) : null}
    </View>
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
  controls: { paddingTop: 14, gap: 8 },
  tools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  tool: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  toolOn: { backgroundColor: colors.darkChipOn },
  rule: { width: 1, height: 26, marginHorizontal: 8, backgroundColor: 'rgba(255, 255, 255, 0.24)' },
  colors: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  swatchHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  swatchBlack: { borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.5)' },
  swatchOn: { borderWidth: 2.5, borderColor: colors.black, outlineWidth: 2, outlineColor: colors.white, outlineStyle: 'solid' },
  note: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1C1C1E',
  },
  noteInput: { ...typeScale.body, flex: 1, height: 44, paddingHorizontal: 14, borderRadius: 12, color: colors.onDark, backgroundColor: colors.darkChip, outlineWidth: 0 },
  noteButton: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
});
