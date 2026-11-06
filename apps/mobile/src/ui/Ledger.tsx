// The Site Office pieces the screens are built from: a section label with a rule under it, a white
// panel, a ledger row, a line of counts, a status pill with its square stamp, the counts grid on a
// job, the big tiles, a thin progress bar and a row of chips.

import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { Chip } from './Chip';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

/** A small solid square: the stamp before an eyebrow, a pill's marker, a ticker line's mark. */
export function Stamp({ color, size = 6, style }: { color: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: size, height: size, backgroundColor: color }, style]} />;
}

/** A section's label, with a rule under it and maybe a link on the right: "Level 1 ... 25 open". */
export function SectionLabel({
  label,
  right,
  onPress,
  rightColor = colors.secondary,
  style,
  testID,
}: {
  label: string;
  right?: string;
  /** Makes the right side a link, in gulf blue with a chevron. */
  onPress?: () => void;
  rightColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.section, style]}>
      <Text variant="label" color={colors.secondary} style={styles.sectionText} numberOfLines={1} accessibilityRole="header">
        {label}
      </Text>
      {right && onPress ? (
        <Touchable feedback="opacity" onPress={onPress} hitSlop={10} accessibilityRole="link" accessibilityLabel={`${label}: ${right}`} testID={testID} style={styles.sectionLink}>
          <Text variant="label" color={colors.tint}>
            {right}
          </Text>
          <Icon name="chevron.right" size={11} color={colors.tint} weight="semibold" />
        </Touchable>
      ) : right ? (
        <Text variant="label" color={rightColor}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** A white square panel with a thin slate border. Rows inside get rules between them. */
export function Panel({ children, style, testID }: { children?: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[styles.panel, style]} testID={testID}>
      {children}
    </View>
  );
}

/** A row in a panel: the stripe on every other row, a rule under all but the last. */
export function LedgerRow({
  children,
  lead,
  trail,
  onPress,
  last,
  stripe,
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
  last?: boolean;
  stripe?: boolean;
  /** Defaults to on when the row opens something. */
  chevron?: boolean;
  align?: 'center' | 'flex-start';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const showChevron = chevron ?? !!onPress;
  const body = (
    <>
      {lead ? <View style={styles.lead}>{lead}</View> : null}
      <View style={styles.main}>{children}</View>
      {trail || showChevron ? (
        <View style={styles.trail}>
          {trail}
          {showChevron ? <Icon name="chevron.right" size={14} color={colors.quiet} weight="medium" /> : null}
        </View>
      ) : null}
    </>
  );
  const rowStyle = [styles.row, { alignItems: align }, stripe ? styles.stripe : null, last ? null : styles.rule, style];
  if (!onPress) {
    return (
      <View style={rowStyle} testID={testID} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Touchable feedback="highlight" pressDelay={40} onPress={onPress} style={rowStyle} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID}>
      {body}
    </Touchable>
  );
}

export interface Fact {
  text: string;
  color?: string;
}

/** A line of counts in mono capitals with dots between: 214 open · 38 ready · 3 late. */
export function MetaLine({ facts, style }: { facts: (Fact | string | null | false | undefined)[]; style?: StyleProp<ViewStyle> }) {
  const shown = facts.filter((f): f is Fact | string => !!f).map((f) => (typeof f === 'string' ? { text: f } : f));
  return (
    <View style={[styles.meta, style]}>
      {shown.map((f, i) => (
        <Fragment key={`${i}-${f.text}`}>
          {i > 0 ? (
            <Text variant="label" weight="400" color={colors.quiet} style={styles.dot}>
              ·
            </Text>
          ) : null}
          <Text variant="label" color={f.color ?? colors.secondary} style={styles.fact}>
            {f.text}
          </Text>
        </Fragment>
      ))}
    </View>
  );
}

export type PillTone = 'ok' | 'wait' | 'late' | 'check' | 'quote' | 'draft' | 'guess' | 'done';

const PILL: Record<PillTone, { color: string; dashed?: boolean }> = {
  ok: { color: colors.ok },
  wait: { color: colors.secondary },
  late: { color: colors.destructive },
  check: { color: colors.tint },
  quote: { color: colors.label, dashed: true },
  draft: { color: colors.secondary, dashed: true },
  guess: { color: colors.tint },
  done: { color: colors.secondary },
};

/** A status pill: an outlined stamp in mono capitals with a square marker. */
export function Pill({ text, tone, marker = true }: { text: string; tone: PillTone; marker?: boolean }) {
  const { color, dashed } = PILL[tone];
  return (
    <View style={[styles.pill, { borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]}>
      {marker ? <Stamp color={color} size={5} /> : null}
      <Text variant="stamp" color={color} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

export interface Figure {
  label: string;
  value: string;
  color?: string;
  onPress?: () => void;
  testID?: string;
}

/** The counts grid on a job: a mono label over a big number, in square cells. */
export function Figures({ cells, columns = 2, style }: { cells: Figure[]; columns?: number; style?: StyleProp<ViewStyle> }) {
  const rows: Figure[][] = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
  return (
    <View style={[styles.figures, style]}>
      {rows.map((row, ri) => (
        <View key={ri} style={[styles.figureRow, ri > 0 ? styles.figureRule : null]}>
          {row.map((c, ci) => {
            const body = (
              <>
                <Text variant="label" color={colors.secondary} numberOfLines={1}>
                  {c.label}
                </Text>
                <Text variant="figure" color={c.color ?? colors.label} tabular numberOfLines={1}>
                  {c.value}
                </Text>
              </>
            );
            const cellStyle = [styles.figure, ci > 0 ? styles.figureDivide : null];
            return c.onPress ? (
              <Touchable
                key={c.label}
                feedback="highlight"
                onPress={c.onPress}
                style={cellStyle}
                accessibilityRole="button"
                accessibilityLabel={`${c.label}: ${c.value}`}
                testID={c.testID}
              >
                {body}
              </Touchable>
            ) : (
              <View key={c.label} style={cellStyle} accessible accessibilityLabel={`${c.label}: ${c.value}`} testID={c.testID}>
                {body}
              </View>
            );
          })}
          {row.length < columns ? <View style={[styles.figure, styles.figureDivide]} /> : null}
        </View>
      ))}
    </View>
  );
}

export interface Tile {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
  badge?: string;
  testID?: string;
}

/** The big square buttons on a job: Walk, Plans, Send Lists. */
export function Tiles({ tiles, style }: { tiles: Tile[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tiles, style]}>
      {tiles.map((t) => {
        const fg = t.primary ? colors.onBar : colors.label;
        return (
          <Touchable
            key={t.label}
            feedback="opacity"
            onPress={t.onPress}
            accessibilityRole="button"
            accessibilityLabel={t.badge ? `${t.label}, ${t.badge}` : t.label}
            testID={t.testID}
            style={[styles.tile, t.primary ? styles.tilePrimary : null]}
          >
            <View style={styles.tileTop}>
              <Icon name={t.icon} size={20} color={fg} />
              {t.badge ? (
                <Text variant="stamp" weight="600" color={t.primary ? colors.oceanside : colors.tint}>
                  {t.badge}
                </Text>
              ) : null}
            </View>
            <Text variant="label" color={fg} numberOfLines={1}>
              {t.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** A thin progress bar: stone blue on a pale track, green once it is all done. */
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color ?? (pct >= 1 ? colors.okFill : colors.stone) }]} />
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

/** A row of chips that scrolls sideways when it runs out of room. */
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
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: layout.inset,
    marginTop: 20,
    paddingBottom: 8,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  sectionText: { flexShrink: 1, fontSize: 11 },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  panel: { marginHorizontal: layout.margin, marginTop: 8, backgroundColor: colors.cell, borderWidth: layout.hairline, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: layout.rowPadding, paddingVertical: 11, minHeight: 48, backgroundColor: colors.cell },
  stripe: { backgroundColor: colors.stripe },
  rule: { borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  lead: { flexShrink: 0 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  trail: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 7, rowGap: 2 },
  dot: { letterSpacing: 0 },
  fact: { letterSpacing: 1.2 },
  pill: { height: 18, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, borderWidth: 1, alignSelf: 'flex-start', flexShrink: 0 },
  figures: { marginHorizontal: layout.margin, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.cell },
  figureRow: { flexDirection: 'row' },
  figureRule: { borderTopWidth: layout.hairline, borderTopColor: colors.border },
  figure: { flex: 1, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 12, gap: 6, backgroundColor: colors.cell },
  figureDivide: { borderLeftWidth: layout.hairline, borderLeftColor: colors.border },
  tiles: { flexDirection: 'row', gap: 8, marginHorizontal: layout.margin },
  tile: {
    flex: 1,
    height: 70,
    paddingHorizontal: 11,
    paddingVertical: 10,
    justifyContent: 'space-between',
    borderWidth: layout.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.cell,
  },
  tilePrimary: { backgroundColor: colors.action, borderColor: colors.action },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  track: { height: 3, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: 3 },
  chips: { flexDirection: 'row', gap: 6, marginHorizontal: layout.margin, overflow: 'hidden' },
  chipsWrap: { flexWrap: 'wrap' },
});
