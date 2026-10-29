// The handful of building blocks every screen uses: big touch targets, house colors, plain words.

import { useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space, type } from '@/constants/theme';
import { useData } from '@/data/api';

/** Shown only in the preview link, so sample data is never mistaken for the real list. */
export function PreviewBanner() {
  const { mode } = useData();
  if (mode !== 'preview') return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>Preview with sample data. Changes last until you reload the page.</Text>
    </View>
  );
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      {scroll ? <ScrollView contentContainerStyle={styles.screenBody} keyboardShouldPersistTaps="handled">{children}</ScrollView> : children}
    </SafeAreaView>
  );
}

export function Section({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onPress,
  muted = false,
  stripe = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  muted?: boolean;
  stripe?: boolean;
}) {
  const body = (
    <View style={[styles.row, stripe && { backgroundColor: colors.cream }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, muted && { color: colors.muted }]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {typeof right === 'string' ? <Text style={styles.rowRight}>{right}</Text> : right}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.blue, fg: colors.white, border: colors.blue },
    secondary: { bg: colors.white, fg: colors.ink, border: colors.hairline },
    danger: { bg: colors.white, fg: colors.danger, border: colors.hairline },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.ink, borderColor: colors.ink }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.segment, value === v && styles.segmentOn]} accessibilityRole="button">
          <Text style={[styles.segmentText, value === v && { color: colors.white }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Field({ label, error, ...input }: { label: string; error?: string | undefined } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, error ? { borderColor: colors.danger } : null]} {...input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.rowSubtitle}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.blue, false: colors.hairline }}
        thumbColor={colors.white}
        // react-native-web colors the on-state thumb separately
        {...(Platform.OS === 'web' ? ({ activeThumbColor: colors.white } as object) : {})}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** A labelled value that opens a searchable list. */
export function Picker({
  label,
  value,
  options,
  onChange,
  error,
  placeholder = 'Choose',
}: {
  label: string;
  value: string | null;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (v: string) => void;
  error?: string | undefined;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = options.find((o) => o.value === value);
  const shown = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, styles.pickerValue, error ? { borderColor: colors.danger } : null]} accessibilityRole="button">
        <Text style={{ color: current ? colors.ink : colors.muted, fontSize: type.body }}>{current?.label ?? placeholder}</Text>
        <Text style={{ color: colors.muted }}>Change</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.screen}>
          <View style={styles.modalHead}>
            <Text style={styles.sectionTitle}>{label}</Text>
            <Button label="Done" kind="secondary" onPress={() => setOpen(false)} />
          </View>
          {options.length > 8 ? (
            <TextInput placeholder="Search" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={[styles.input, { margin: space(2) }]} />
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(o) => o.value}
            renderItem={({ item, index }) => (
              <Row
                title={item.label}
                {...(item.hint ? { subtitle: item.hint } : {})}
                stripe={index % 2 === 1}
                right={item.value === value ? 'Chosen' : undefined}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                  setQuery('');
                }}
              />
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warn' | 'danger' | 'good' }) {
  const color = { muted: colors.muted, warn: colors.warn, danger: colors.danger, good: colors.good }[tone];
  return <Text style={[styles.note, { color }]}>{children}</Text>;
}

export function Badge({ label, tone }: { label: string; tone: 'good' | 'warn' | 'muted' | 'ink' }) {
  const color = { good: colors.good, warn: colors.warn, muted: colors.muted, ink: colors.ink }[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  screenBody: { padding: space(2), paddingBottom: space(6), gap: space(2) },
  section: { gap: space(1) },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: type.heading, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingVertical: 14, paddingHorizontal: space(2), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, minHeight: 52, backgroundColor: colors.white },
  rowTitle: { fontSize: type.body, color: colors.ink, fontWeight: '600' },
  rowSubtitle: { fontSize: type.small, color: colors.muted, marginTop: 2 },
  rowRight: { fontSize: type.small, color: colors.blue, fontWeight: '600' },
  button: { minHeight: 48, paddingHorizontal: space(2), borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: type.body, fontWeight: '700' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.white },
  chipText: { fontSize: type.small, color: colors.ink, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: colors.ink, borderRadius: 10, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.white },
  segmentOn: { backgroundColor: colors.ink },
  segmentText: { fontSize: type.small, fontWeight: '700', color: colors.ink },
  field: { gap: 6 },
  label: { fontSize: type.small, fontWeight: '700', color: colors.ink },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.hairline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: type.body, color: colors.ink, backgroundColor: colors.white },
  pickerValue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  error: { fontSize: type.small, color: colors.danger },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space(1), minHeight: 52 },
  toggleLabel: { fontSize: type.body, color: colors.ink, fontWeight: '600' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space(2), borderBottomWidth: 1, borderBottomColor: colors.hairline },
  note: { fontSize: type.small, lineHeight: 18 },
  banner: { backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.hairline, borderRadius: 10, padding: space(1.5) },
  bannerText: { fontSize: type.small, color: colors.ink, fontWeight: '600' },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
