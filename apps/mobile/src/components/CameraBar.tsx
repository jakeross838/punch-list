// The bar at the bottom of a job and of a room: the camera in the middle, big enough to hit
// without looking, and a control on either side.

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/constants/theme';
import { Icon, Text, Touchable, type IconName } from '@/ui';

export const CAMERA_BAR_HEIGHT = 72;

export function CameraBar({
  left,
  right,
  onCamera,
  cameraLabel = 'Take a Photo',
}: {
  left?: ReactNode;
  right?: ReactNode;
  onCamera: () => void;
  cameraLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.side}>{left}</View>
      <Touchable feedback="scale" onPress={onCamera} accessibilityRole="button" accessibilityLabel={cameraLabel} testID="camera" style={styles.camera}>
        <Icon name="camera" size={28} color={colors.white} weight="medium" />
      </Touchable>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

/** An icon with a small label under it, like a tab bar item. A badge is a red count on the icon. */
export function BarTool({
  icon,
  label,
  onPress,
  badge,
  badgeLabel,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
  /** What the badge counts, for VoiceOver: "past due". */
  badgeLabel?: string;
  testID?: string;
}) {
  const shown = badge !== undefined && badge > 0;
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={shown ? `${label}, ${badge} ${badgeLabel ?? ''}`.trim() : label}
      testID={testID}
      style={styles.tool}
    >
      <View>
        <Icon name={icon} size={25} color={colors.tint} />
        {shown ? (
          <View style={styles.badge} testID={testID ? `${testID}-badge` : undefined}>
            <Text variant="caption1" weight="700" color={colors.white} tabular style={styles.badgeText}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption1" weight="500" color={colors.tint} numberOfLines={1} style={styles.toolLabel}>
        {label}
      </Text>
    </Touchable>
  );
}

/** A location before or after this one: a chevron and its name. */
export function RoomStep({ direction, label, onPress }: { direction: 'previous' | 'next'; label: string; onPress: () => void }) {
  const prev = direction === 'previous';
  return (
    <Touchable
      feedback="opacity"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${prev ? 'Previous' : 'Next'} location, ${label}`}
      testID={prev ? 'room-previous' : 'room-next'}
      style={[styles.step, prev ? null : styles.stepNext]}
    >
      {prev ? <Icon name="chevron.left" size={16} color={colors.tint} weight="semibold" /> : null}
      <Text variant="subheadline" color={colors.tint} numberOfLines={2} style={styles.stepLabel}>
        {label}
      </Text>
      {prev ? null : <Icon name="chevron.right" size={16} color={colors.tint} weight="semibold" />}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: layout.hairline,
    borderTopColor: colors.separator,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px) saturate(180%)' } : null),
  },
  side: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  right: {},
  camera: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  tool: { minWidth: 88, height: 60, alignItems: 'center', justifyContent: 'center', gap: 3 },
  toolLabel: { fontSize: 11, lineHeight: 13 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -11,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.destructive,
  },
  badgeText: { fontSize: 11, lineHeight: 13 },
  step: { flex: 1, height: 60, flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 0 },
  stepNext: { justifyContent: 'flex-end' },
  stepLabel: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
});
