// Inset grouped lists, the Settings look: rounded white sections on the gray background, rows
// with an optional colored icon tile, hairline separators that start at the text.

import { Children, createContext, isValidElement, useContext, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View, type ColorValue, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Switch } from './Switch';
import { Text } from './Text';
import { Touchable } from './Touchable';

const RowPosition = createContext<{ last: boolean }>({ last: true });

/** Where the separator starts: at the text, after an icon tile when there is one. */
const TILE = 30;
const TEXT_START_WITH_TILE = layout.rowPadding + TILE + 14;

export function ListSection({
  header,
  footer,
  footerTone = 'default',
  headerRight,
  children,
  style,
  testID,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  footerTone?: 'default' | 'danger';
  headerRight?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.section, style]} testID={testID}>
      {header != null || headerRight ? (
        <View style={styles.headerRow}>
          {typeof header === 'string' ? (
            <Text variant="footnote" weight="500" color={colors.secondary} style={{ flex: 1 }}>
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
            <RowPosition.Provider key={row.key ?? i} value={{ last: i === rows.length - 1 }}>
              {row}
            </RowPosition.Provider>
          ))}
        </View>
      ) : null}
      {footer ? (
        typeof footer === 'string' ? (
          <Text variant="footnote" color={footerTone === 'danger' ? colors.redText : colors.secondary} style={styles.footer}>
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

function useSeparator(hasTile: boolean): ReactNode {
  const { last } = useContext(RowPosition);
  return last ? null : <Separator inset={hasTile ? TEXT_START_WITH_TILE : layout.rowPadding} />;
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
  const separator = useSeparator(!!icon);
  const titleColor = tone === 'tint' ? colors.tint : tone === 'destructive' ? colors.red : colors.label;
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
      {accessory === 'chevron' ? <Icon name="chevron.right" size={13} color={colors.tertiary} weight="bold" /> : null}
      {accessory === 'checkmark' ? <Icon name="checkmark" size={18} color={colors.tint} weight="semibold" /> : null}
      {separator}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
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
      style={styles.row}
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
  icon,
  iconColor,
  value,
  onValueChange,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: ColorValue;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  const separator = useSeparator(!!icon);
  return (
    <View style={styles.row}>
      {icon ? <IconTile name={icon} color={iconColor ?? colors.tint} /> : null}
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

/** A row that is a text field. Multiline rows grow with what is typed. */
export function ListTextField({
  multiline,
  minLines = 3,
  invalid,
  ...props
}: TextInputProps & { minLines?: number; invalid?: boolean }) {
  const separator = useSeparator(false);
  const minHeight = multiline ? Math.max(layout.rowMinHeight, minLines * typeScale.body.lineHeight + 22) : layout.rowMinHeight;
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
            else setHeight(Math.max(minHeight, content + 22));
          }
          props.onContentSizeChange?.(e);
        }}
        style={[styles.input, multiline ? { height, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'top' } : null, props.style]}
      />
      {separator}
    </View>
  );
}

/** A label on the left and a short text field on the right, like "PO or CO". */
export function ListLabeledField({
  label,
  icon,
  iconColor,
  invalid,
  ...props
}: TextInputProps & { label: string; icon?: IconName; iconColor?: ColorValue; invalid?: boolean }) {
  const separator = useSeparator(!!icon);
  return (
    <View style={[styles.row, invalid ? styles.invalid : null]}>
      {icon ? <IconTile name={icon} color={iconColor ?? colors.tint} /> : null}
      <Text>{label}</Text>
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
      {icon ? <Icon name={icon} size={19} color={fg} weight="semibold" /> : null}
      <Text variant="headline" color={fg}>
        {label}
      </Text>
    </Touchable>
  );
}

export function EmptyState({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={colors.gray2} />
      <Text variant="title3" weight="700" align="center">
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
      <Icon name={icon} size={19} color={colors.tint} />
      <Text variant="subheadline" color={colors.secondary} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginHorizontal: layout.margin, marginBottom: 28 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.rowPadding,
    paddingBottom: 7,
    minHeight: 18,
  },
  card: { backgroundColor: colors.cell, borderRadius: layout.radius, overflow: 'hidden' },
  footer: { paddingHorizontal: layout.rowPadding, paddingTop: 7 },
  separator: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
  },
  row: {
    minHeight: layout.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: layout.rowPadding,
    paddingVertical: 10,
    backgroundColor: colors.cell,
  },
  rowText: { flex: 1, gap: 1 },
  value: { maxWidth: '58%', textAlign: 'right' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  fieldRow: { paddingHorizontal: layout.rowPadding, backgroundColor: colors.cell },
  invalid: { backgroundColor: 'rgba(255, 59, 48, 0.06)' },
  input: {
    ...typeScale.body,
    color: colors.label,
    minHeight: layout.rowMinHeight,
    paddingVertical: 0,
    outlineWidth: 0,
  },
  labeledInput: { flex: 1, textAlign: 'right' },
  button: {
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
  },
  buttonFilled: { backgroundColor: colors.tint },
  buttonTinted: { backgroundColor: colors.tintSoft },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 40, paddingVertical: 48 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: layout.margin,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.tintSoft,
  },
});
