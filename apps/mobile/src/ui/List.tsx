// Lists in two styles. Grouped: white rounded sections on the light gray background, for sheets
// and forms. Plain: rows straight on white with hairlines that start at the text, for screens.

import { Children, createContext, isValidElement, useContext, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View, type ColorValue, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Switch } from './Switch';
import { Text } from './Text';
import { Touchable } from './Touchable';

type Variant = 'grouped' | 'plain';

const RowPosition = createContext<{ last: boolean; variant: Variant }>({ last: true, variant: 'grouped' });

const TILE = 30;

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
  const plain = variant === 'plain';
  return (
    <View style={[plain ? styles.plainSection : styles.section, style]} testID={testID}>
      {header != null || headerRight ? (
        <View style={plain ? styles.plainHeader : styles.header}>
          {typeof header === 'string' ? (
            <Text
              variant={plain ? 'subheadline' : 'footnote'}
              weight={plain ? '600' : '400'}
              color={colors.secondary}
              style={{ flex: 1 }}
            >
              {header}
            </Text>
          ) : (
            <View style={{ flex: 1 }}>{header}</View>
          )}
          {headerRight}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={plain ? styles.plainRows : styles.card}>
          {rows.map((row, i) => (
            <RowPosition.Provider key={row.key ?? i} value={{ last: i === rows.length - 1, variant }}>
              {row}
            </RowPosition.Provider>
          ))}
        </View>
      ) : null}
      {footer ? (
        typeof footer === 'string' ? (
          <Text variant="footnote" color={footerTone === 'danger' ? colors.destructive : colors.secondary} style={plain ? styles.plainFooter : styles.footer}>
            {footer}
          </Text>
        ) : (
          <View style={plain ? styles.plainFooter : styles.footer}>{footer}</View>
        )
      ) : null}
    </View>
  );
}

export function Separator({ inset = layout.rowPadding }: { inset?: number }) {
  return <View style={[styles.separator, { left: inset }]} />;
}

function useRow(hasTile: boolean): { separator: ReactNode; rowStyle: StyleProp<ViewStyle> } {
  const { last, variant } = useContext(RowPosition);
  const plain = variant === 'plain';
  const inset = plain ? 0 : hasTile ? layout.rowPadding + TILE + 14 : layout.rowPadding;
  return {
    separator: last ? null : <Separator inset={inset} />,
    rowStyle: plain ? styles.plainRow : null,
  };
}

export function IconTile({ name, color, size = TILE }: { name: IconName; color: ColorValue; size?: number }) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size * 0.27, backgroundColor: color }]}>
      <Icon name={name} size={size * 0.6} color={colors.white} weight="medium" />
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
}: ListRowProps) {
  const { separator, rowStyle } = useRow(!!icon);
  const titleColor = tone === 'tint' ? colors.tint : tone === 'destructive' ? colors.destructive : colors.label;
  const body = (
    <>
      {icon ? <IconTile name={icon} color={iconColor} /> : null}
      <View style={styles.rowText}>
        <Text color={titleColor} numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="subheadline" color={colors.secondary} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text color={valueColor} numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {right}
      {accessory === 'chevron' ? <Icon name="chevron.right" size={13} color={colors.chevron} weight="bold" /> : null}
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

/** A row that is a text field. title: the large field at the top of an item. Multiline grows. */
export function ListTextField({
  multiline,
  minLines = 3,
  invalid,
  size = 'body',
  ...props
}: TextInputProps & { minLines?: number; invalid?: boolean; size?: 'body' | 'title' }) {
  const { separator } = useRow(false);
  const minHeight = multiline ? Math.max(layout.rowMinHeight, minLines * typeScale.body.lineHeight + 24) : size === 'title' ? 54 : layout.rowMinHeight;
  const [height, setHeight] = useState(minHeight);
  return (
    <View style={[styles.fieldRow, invalid ? styles.invalid : null]}>
      <TextInput
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.tint}
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
          multiline ? { height, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' } : null,
          props.style,
        ]}
      />
      {separator}
    </View>
  );
}

/** A label on the left and a short text field on the right, like "Order Number". */
export function ListLabeledField({ label, invalid, ...props }: TextInputProps & { label: string; invalid?: boolean }) {
  const { separator, rowStyle } = useRow(false);
  return (
    <View style={[styles.row, rowStyle, invalid ? styles.invalid : null]}>
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.tint}
        accessibilityLabel={label}
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
  /** filled: the accent pill. tinted: a light gray pill with accent text. */
  variant?: 'filled' | 'tinted' | 'plain';
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
}) {
  const fg = variant === 'filled' ? colors.white : colors.tint;
  return (
    <Touchable
      feedback="scale"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={[styles.button, variant === 'filled' ? styles.buttonFilled : variant === 'tinted' ? styles.buttonTinted : null]}
    >
      {icon ? <Icon name={icon} size={18} color={fg} weight="semibold" /> : null}
      <Text variant="headline" color={fg}>
        {label}
      </Text>
    </Touchable>
  );
}

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={40} color={colors.chevron} />
      <Text variant="title3" weight="600" align="center">
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

export function Banner({ icon = 'info.circle', children }: { icon?: IconName; children: string }) {
  return (
    <View style={styles.banner}>
      <Icon name={icon} size={17} color={colors.secondary} />
      <Text variant="footnote" color={colors.secondary} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: layout.margin, marginBottom: 22 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.rowPadding, paddingBottom: 7, minHeight: 18 },
  card: { backgroundColor: colors.cell, borderRadius: layout.radius, overflow: 'hidden' },
  footer: { paddingHorizontal: layout.rowPadding, paddingTop: 8 },
  plainSection: { marginBottom: 6 },
  plainHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingHorizontal: layout.inset, paddingTop: 22, paddingBottom: 4 },
  plainRows: { marginLeft: layout.inset },
  plainFooter: { paddingHorizontal: layout.inset, paddingTop: 8 },
  separator: { position: 'absolute', right: 0, bottom: 0, height: 1, backgroundColor: colors.separator },
  row: {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.rowPadding,
    paddingVertical: 10,
    backgroundColor: colors.cell,
  },
  plainRow: { paddingLeft: 0, paddingRight: layout.inset, minHeight: 48 },
  rowText: { flex: 1, gap: 1 },
  value: { maxWidth: '60%', textAlign: 'right' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  fieldRow: { paddingHorizontal: layout.rowPadding, backgroundColor: colors.cell },
  invalid: { backgroundColor: 'rgba(215, 0, 21, 0.05)' },
  input: { ...typeScale.body, color: colors.label, minHeight: layout.rowMinHeight, paddingVertical: 0, outlineWidth: 0 },
  titleInput: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2, minHeight: 54 },
  label: { flexShrink: 0 },
  // minWidth 0 lets the field shrink beside its label (a web input otherwise keeps its own width).
  labeledInput: { flex: 1, minWidth: 0, textAlign: 'right' },
  button: { height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 },
  buttonFilled: { backgroundColor: colors.tint },
  buttonTinted: { backgroundColor: colors.surface },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 40, paddingVertical: 48 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: layout.inset, marginTop: 20 },
});
