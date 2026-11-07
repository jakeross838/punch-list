// The pieces the screens are built from, drawn the way the iPhone's own apps draw them: a short
// section header, a white card with rounded corners, rows with thin lines that start where the
// words do, a line of counts, a rounded status tag, the count tiles at the top of a job (as
// Reminders has its lists), a thin progress bar and a row of chips.

import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { Chip } from './Chip';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

/** A small round dot: a state's color beside its name. */
export function Stamp({ color, size = 8, style }: { color: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/**
 * A section's header above a card, maybe with a count or a link on the right. Plain: the short
 * gray words of the iPhone's Settings. Prominent: the bold header of Notes and Reminders, for the
 * floors of a job.
 */
export function SectionLabel({
  label,
  right,
  onPress,
  rightColor = colors.secondary,
  prominent,
  style,
  testID,
}: {
  label: string;
  right?: string;
  /** Makes the right side a link, in blue. */
  onPress?: () => void;
  rightColor?: string;
  prominent?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const variant = prominent ? 'title3' : 'footnote';
  return (
    <View style={[styles.section, prominent ? styles.sectionProminent : null, style]}>
      <Text
        variant={variant}
        weight={prominent ? '700' : undefined}
        color={prominent ? colors.label : colors.secondary}
        style={styles.sectionText}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {label}
      </Text>
      {right && onPress ? (
        <Touchable feedback="opacity" onPress={onPress} hitSlop={10} accessibilityRole="link" accessibilityLabel={`${label}: ${right}`} testID={testID}>
          <Text variant={prominent ? 'body' : 'footnote'} color={colors.tint}>
            {right}
          </Text>
        </Touchable>
      ) : right ? (
        <Text variant={prominent ? 'subheadline' : 'footnote'} color={rightColor} tabular testID={testID}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** A white card with rounded corners. Rows inside get thin lines between them. */
export function Panel({ children, style, testID }: { children?: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[styles.panel, style]} testID={testID}>
      {children}
    </View>
  );
}

/**
 * A row in a card: something at the start, the words, something at the end and a chevron when it
 * opens something. The thin line under it starts where the words do and runs to the edge, as on
 * the iPhone; the last row has none. In a long list each row is its own piece of the card: card
 * says which piece, and the first and last get the rounded corners.
 */
export function LedgerRow({
  children,
  lead,
  trail,
  onPress,
  onLongPress,
  last: lastRow,
  card,
  chevron,
  align = 'center',
  style,
  accessibilityLabel,
  testID,
}: {
  children: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  onPress?: () => void;
  /** Holding the row down: what else can be done to it. */
  onLongPress?: () => void;
  last?: boolean;
  /** The row is a piece of a card in a long list, not in a Panel. */
  card?: { first: boolean; last: boolean };
  /** Defaults to on when the row opens something. */
  chevron?: boolean;
  align?: 'center' | 'flex-start';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const showChevron = chevron ?? !!onPress;
  const last = card ? card.last : lastRow;
  const rowStyle = card ? [styles.row, styles.cardRow, card.first ? styles.cardFirst : null, card.last ? styles.cardLast : null] : styles.row;
  const body = (
    <>
      {lead ? <View style={[styles.lead, align === 'center' ? styles.leadCenter : styles.leadTop]}>{lead}</View> : null}
      <View style={[styles.body, { alignItems: align }, last ? null : styles.rule, style]}>
        <View style={styles.main}>{children}</View>
        {trail || showChevron ? (
          <View style={styles.trail}>
            {trail}
            {showChevron ? <Icon name="chevron.right" size={14} color={colors.chevron} weight="semibold" /> : null}
          </View>
        ) : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={rowStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Touchable
      feedback="highlight"
      pressDelay={40}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'More' }] : undefined}
      onAccessibilityAction={onLongPress ? (e) => e.nativeEvent.actionName === 'longpress' && onLongPress() : undefined}
      testID={testID}
    >
      {body}
    </Touchable>
  );
}

export interface Fact {
  text: string;
  color?: string;
}

/** A line of counts with dots between: 214 open · 38 ready · 3 late. */
export function MetaLine({ facts, style, testID }: { facts: (Fact | string | null | false | undefined)[]; style?: StyleProp<ViewStyle>; testID?: string }) {
  const shown = facts.filter((f): f is Fact | string => !!f).map((f) => (typeof f === 'string' ? { text: f } : f));
  return (
    <View style={[styles.meta, style]} testID={testID}>
      {shown.map((f, i) => (
        <Fragment key={`${i}-${f.text}`}>
          {i > 0 ? (
            <Text variant="subheadline" color={colors.quiet}>
              ·
            </Text>
          ) : null}
          <Text variant="subheadline" color={f.color ?? colors.secondary}>
            {f.text}
          </Text>
        </Fragment>
      ))}
    </View>
  );
}

export type PillTone = 'ok' | 'wait' | 'late' | 'check' | 'quote' | 'draft' | 'guess' | 'done';

const PILL: Record<PillTone, { color: string; fill: string }> = {
  ok: { color: colors.ok, fill: 'rgba(52, 199, 89, 0.15)' },
  wait: { color: colors.secondary, fill: colors.chip },
  late: { color: colors.destructive, fill: 'rgba(255, 59, 48, 0.12)' },
  check: { color: colors.tint, fill: 'rgba(0, 122, 255, 0.12)' },
  quote: { color: colors.label, fill: colors.chip },
  draft: { color: colors.secondary, fill: colors.chip },
  guess: { color: colors.tint, fill: 'rgba(0, 122, 255, 0.12)' },
  done: { color: colors.secondary, fill: colors.chip },
};

/** A status tag: a few words on a rounded tint of their color. */
export function Pill({ text, tone }: { text: string; tone: PillTone }) {
  const { color, fill } = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: fill }]}>
      <Text variant="stamp" color={color} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export interface Figure {
  label: string;
  value: string;
  /** The round icon at the top of the tile, in this color. */
  icon?: IconName;
  color?: string;
  onPress?: () => void;
  testID?: string;
}

/** The counts at the top of a job, as Reminders has its lists: white rounded tiles, an icon in a circle, the number big on the right and the name under it. */
export function Figures({ cells, columns = 2, style }: { cells: Figure[]; columns?: number; style?: StyleProp<ViewStyle> }) {
  const rows: Figure[][] = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
  return (
    <View style={[styles.figures, style]}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.figureRow}>
          {row.map((c) => {
            const body = (
              <>
                <View style={styles.figureTop}>
                  {c.icon ? (
                    <View style={[styles.figureIcon, { backgroundColor: c.color ?? colors.stone }]}>
                      <Icon name={c.icon} size={16} color={colors.white} weight="semibold" />
                    </View>
                  ) : (
                    <View />
                  )}
                  <Text variant={c.value.length > 6 ? 'title3' : 'title1'} tabular numberOfLines={1}>
                    {c.value}
                  </Text>
                </View>
                <Text variant="subheadline" weight="600" color={colors.secondary} numberOfLines={1}>
                  {c.label}
                </Text>
              </>
            );
            return c.onPress ? (
              <Touchable
                key={c.label}
                feedback="highlight"
                onPress={c.onPress}
                style={styles.figure}
                accessibilityRole="button"
                accessibilityLabel={`${c.label}: ${c.value}`}
                testID={c.testID}
              >
                {body}
              </Touchable>
            ) : (
              <View key={c.label} style={styles.figure} accessible accessibilityLabel={`${c.label}: ${c.value}`} testID={c.testID}>
                {body}
              </View>
            );
          })}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`gap-${i}`} style={styles.figureGap} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A thin progress bar: blue on a pale track, green once it is all done. */
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color ?? (pct >= 1 ? colors.okFill : colors.tint) }]} />
    </View>
  );
}

export interface ChipChoice {
  key: string;
  label: string;
  on: boolean;
  onPress: () => void;
  testID?: string;
}

/** A row of chips, wrapping onto a second line when it runs out of room. */
export function ChipRow({ chips, wrap, style }: { chips: ChipChoice[]; wrap?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.chips, wrap ? styles.chipsWrap : null, style]}>
      {chips.map((c) => (
        <Chip key={c.key} label={c.label} on={c.on} onPress={c.onPress} testID={c.testID} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The words line up with the words in the card's rows below.
  section: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: layout.margin + layout.rowPadding,
    marginTop: 22,
    marginBottom: 6,
  },
  sectionProminent: { marginHorizontal: layout.inset, marginTop: 24, marginBottom: 8 },
  sectionText: { flexShrink: 1 },
  panel: { marginHorizontal: layout.margin, backgroundColor: colors.cell, borderRadius: layout.radius, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingLeft: layout.rowPadding, minHeight: layout.rowMinHeight, backgroundColor: colors.cell },
  cardRow: { marginHorizontal: layout.margin, overflow: 'hidden' },
  cardFirst: { borderTopLeftRadius: layout.radius, borderTopRightRadius: layout.radius },
  cardLast: { borderBottomLeftRadius: layout.radius, borderBottomRightRadius: layout.radius },
  lead: { flexShrink: 0, marginRight: 12 },
  leadCenter: { justifyContent: 'center' },
  leadTop: { paddingTop: 11 },
  body: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, paddingVertical: 11, paddingRight: layout.rowPadding },
  rule: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  main: { flex: 1, minWidth: 0, gap: 2 },
  trail: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 5, rowGap: 0 },
  pill: { height: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start', flexShrink: 0 },
  figures: { marginHorizontal: layout.margin, gap: 10 },
  figureRow: { flexDirection: 'row', gap: 10 },
  figure: { flex: 1, minHeight: 78, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 9, justifyContent: 'space-between', gap: 6, borderRadius: 12, backgroundColor: colors.cell },
  figureGap: { flex: 1 },
  figureTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  figureIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  chips: { flexDirection: 'row', gap: 8, marginHorizontal: layout.margin, overflow: 'hidden' },
  chipsWrap: { flexWrap: 'wrap' },
});
