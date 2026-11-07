// Lists the way the iPhone's own Settings and Reminders draw them: a short gray header, then a
// white card with rounded corners on light gray, its rows divided by thin lines that start where
// the words do. Both variants look the same; plain is kept for the screens that still ask for it.

import { Children, createContext, isValidElement, useContext, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Platform, StyleSheet, TextInput, View, type ColorValue, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, fieldFont, layout, type as typeScale } from '@/constants/theme';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Switch } from './Switch';
import { Text, TEXT_LARGEST as FIELD_TEXT_LARGEST } from './Text';
import { Touchable } from './Touchable';

type Variant = 'grouped' | 'plain';

const RowPosition = createContext<{ last: boolean; variant: Variant }>({ last: true, variant: 'grouped' });

const TILE = 32;

export function ListSection({
  header,
  footer,
  footerTone = 'default',
  headerRight,
  children,
  style,
  testID,
  variant = 'grouped',
}: {
  header?: ReactNode;
  footer?: ReactNode;
  footerTone?: 'default' | 'danger';
  headerRight?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  variant?: Variant;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.section, style]} testID={testID}>
      {header != null || headerRight ? (
        <View style={styles.header}>
          {typeof header === 'string' ? (
            <Text variant="label" color={colors.secondary} style={styles.headerText} accessibilityRole="header">
              {header}
            </Text>
          ) : (
            <View style={{ flex: 1 }}>{header}</View>
          )}
          {headerRight}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.card}>
          {rows.map((row, i) => (
            <RowPosition.Provider key={row.key ?? i} value={{ last: i === rows.length - 1, variant }}>
              {row}
            </RowPosition.Provider>
          ))}
        </View>
      ) : null}
      {footer ? (
        typeof footer === 'string' ? (
          <Text variant="footnote" color={footerTone === 'danger' ? colors.destructive : colors.secondary} style={styles.footer}>
            {footer}
          </Text>
        ) : (
          <View style={styles.footer}>{footer}</View>
        )
      ) : null}
    </View>
  );
}

export function Separator({ inset = layout.rowPadding }: { inset?: number }) {
  return <View style={[styles.separator, { left: inset }]} />;
}

function useRow(hasTile: boolean): { separator: ReactNode; rowStyle: StyleProp<ViewStyle> } {
  const { last } = useContext(RowPosition);
  // The line starts where the words do, after an icon when there is one.
  return { separator: last ? null : <Separator inset={hasTile ? layout.rowPadding + TILE + 12 : layout.rowPadding} />, rowStyle: null };
}

/** An icon at the start of a row, as the iPhone's Settings has them. */
export function IconTile({ name, color = colors.tint, size = TILE }: { name: IconName; color?: ColorValue; size?: number }) {
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Icon name={name} size={Math.round(size * 0.72)} color={color} />
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: ColorValue;
  icon?: IconName;
  iconColor?: ColorValue;
  accessory?: 'chevron' | 'checkmark' | 'none';
  right?: ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'tint' | 'destructive';
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  titleLines?: number;
  /** A form field: the title as a mono label, the value in ink. */
  field?: boolean;
}

export function ListRow({
  title,
  subtitle,
  value,
  valueColor = colors.secondary,
  icon,
  iconColor = colors.tint,
  accessory = 'none',
  right,
  onPress,
  tone = 'default',
  disabled,
  testID,
  accessibilityLabel,
  titleLines = 2,
  field = false,
}: ListRowProps) {
  const { separator, rowStyle } = useRow(!!icon);
  const titleColor = tone === 'tint' ? colors.tint : tone === 'destructive' ? colors.destructive : colors.label;
  const body = (
    <>
      {icon ? <IconTile name={icon} color={iconColor} /> : null}
      <View style={styles.rowText}>
        <Text variant="body" color={titleColor} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" color={valueColor} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {right}
      {accessory === 'chevron' ? <Icon name="chevron.right" size={15} color={colors.chevron} weight="semibold" /> : null}
      {accessory === 'checkmark' ? <Icon name="checkmark" size={18} color={colors.tint} weight="semibold" /> : null}
      {separator}
    </>
  );
  if (!onPress) {
    return (
      <View style={[styles.row, rowStyle]} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Touchable
      feedback="highlight"
      pressDelay={40}
      onPress={onPress}
      disabled={disabled}
      style={[styles.row, rowStyle]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
    >
      {body}
    </Touchable>
  );
}

export function ListSwitchRow({
  title,
  subtitle,
  value,
  onValueChange,
  testID,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  const { separator, rowStyle } = useRow(false);
  return (
    <View style={[styles.row, rowStyle]}>
      <View style={styles.rowText}>
        <Text>{title}</Text>
        {subtitle ? (
          <Text variant="subheadline" color={colors.secondary}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} accessibilityLabel={title} testID={testID} />
      {separator}
    </View>
  );
}

/** The text fields' own: a field to move to with Next. */
export type FieldRef = Ref<ComponentRef<typeof TextInput>>;

/**
 * A row that is a text field. title: the large field at the top of an item. Multiline grows. A
 * one line field shows the clear button while you type in it, as iPhone fields do.
 */
export function ListTextField({
  multiline,
  minLines = 3,
  invalid,
  size = 'body',
  ...props
}: TextInputProps & { minLines?: number; invalid?: boolean; size?: 'body' | 'title'; ref?: FieldRef }) {
  const { separator } = useRow(false);
  const minHeight = multiline ? Math.max(layout.rowMinHeight, minLines * typeScale.body.lineHeight + 24) : size === 'title' ? 54 : layout.rowMinHeight;
  const [height, setHeight] = useState(minHeight);
  return (
    <View style={[styles.fieldRow, invalid ? styles.invalid : null]}>
      <TextInput
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.tint}
        clearButtonMode={multiline ? 'never' : 'while-editing'}
        maxFontSizeMultiplier={FIELD_TEXT_LARGEST}
        {...props}
        multiline={multiline}
        onContentSizeChange={(e) => {
          if (multiline) {
            const content = e.nativeEvent.contentSize.height;
            // On the web the measured size already includes the padding and never drops below
            // the field's own height, so the field only grows there.
            if (Platform.OS === 'web') setHeight((h) => (content > h + 1 ? content : h));
            else setHeight(Math.max(minHeight, content + 24));
          }
          props.onContentSizeChange?.(e);
        }}
        style={[
          styles.input,
          size === 'title' ? styles.titleInput : null,
          multiline
            ? { height, lineHeight: size === 'title' ? 26 : typeScale.body.lineHeight, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' }
            : null,
          props.style,
        ]}
      />
      {separator}
    </View>
  );
}

/** A label on the left and a short text field on the right, like the order's "Number". */
export function ListLabeledField({ label, invalid, ...props }: TextInputProps & { label: string; invalid?: boolean; ref?: FieldRef }) {
  const { separator, rowStyle } = useRow(false);
  return (
    <View style={[styles.row, rowStyle, invalid ? styles.invalid : null]}>
      <Text variant="body" numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.tint}
        accessibilityLabel={label}
        clearButtonMode="while-editing"
        maxFontSizeMultiplier={FIELD_TEXT_LARGEST}
        {...props}
        style={[styles.input, styles.labeledInput, props.style]}
      />
      {separator}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'filled',
  icon,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  /** filled: blue with white words. tinted: light gray with blue words. plain: blue words only. */
  variant?: 'filled' | 'tinted' | 'plain';
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
}) {
  const fg = variant === 'filled' ? colors.white : colors.tint;
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={[styles.button, variant === 'filled' ? styles.buttonFilled : variant === 'tinted' ? styles.buttonTinted : styles.buttonPlain, disabled ? styles.buttonOff : null]}
    >
      {icon ? <Icon name={icon} size={18} color={fg} weight="medium" /> : null}
      <Text variant="button" weight="600" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={44} color={colors.quiet} />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="subheadline" color={colors.secondary} align="center">
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** A note in a rounded white box with an icon, like "You can start taking photos now." */
export function Banner({ icon, children, tone = 'info' }: { icon?: IconName; children: string; tone?: 'info' | 'warning' }) {
  const mark = tone === 'warning' ? colors.destructive : colors.tint;
  return (
    <View style={styles.banner}>
      {icon ? <Icon name={icon} size={16} color={mark} /> : <View style={[styles.bannerMark, { backgroundColor: mark }]} />}
      <Text variant="subheadline" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: layout.margin, marginBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: layout.rowPadding, marginBottom: 6, minHeight: 18 },
  headerText: { flex: 1 },
  card: { backgroundColor: colors.cell, borderRadius: layout.radius, overflow: 'hidden' },
  footer: { paddingHorizontal: layout.rowPadding, paddingTop: 6 },
  // A border, not a filled box: borders snap to the screen's pixels, so the line stays sharp.
  separator: { position: 'absolute', right: 0, bottom: 0, height: 0, borderBottomWidth: layout.fine, borderBottomColor: colors.separator },
  row: {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.rowPadding,
    paddingVertical: 11,
    backgroundColor: colors.cell,
  },
  rowText: { flex: 1, gap: 2 },
  value: { maxWidth: '60%', textAlign: 'right' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  fieldRow: { paddingHorizontal: layout.rowPadding, backgroundColor: colors.cell },
  invalid: { backgroundColor: 'rgba(255, 59, 48, 0.06)' },
  // One line: no line height, so the words stay put as you type (see fieldFont). Wrapping fields add it.
  input: { ...fieldFont('body'), color: colors.label, minHeight: layout.rowMinHeight, paddingVertical: 0, outlineWidth: 0 },
  titleInput: { ...fieldFont('title3'), minHeight: 52 },
  label: { flexShrink: 0 },
  // minWidth 0 lets the field shrink beside its label (a web input otherwise keeps its own width).
  labeledInput: { flex: 1, minWidth: 0, textAlign: 'right', color: colors.secondary },
  button: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, borderRadius: layout.buttonRadius },
  buttonFilled: { backgroundColor: colors.action },
  buttonTinted: { backgroundColor: colors.chip },
  buttonPlain: { backgroundColor: 'transparent', height: 44 },
  buttonOff: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 40, paddingVertical: 48 },
  emptyIcon: { marginBottom: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: layout.margin,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: layout.radius,
    backgroundColor: colors.cell,
  },
  bannerMark: { width: 8, height: 8, marginTop: 6, borderRadius: 4 },
});
