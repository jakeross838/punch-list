// A drop-down menu, the same on the iPhone and the preview page: a white square panel under the
// button that opened it, with a check beside what is on. Tap a choice or anywhere else to close.

import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors } from '@/constants/theme';
import { BarButtonView } from './BarButton';
import { haptic } from './haptics';
import { Icon } from './Icon';
import type { BarMenu, MenuAction, MenuGroup } from './page-types';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface MenuAnchor {
  top: number;
  /** Lined up with the button's right edge, or its left edge when it opens from the left. */
  right?: number;
  left?: number;
}

/** Where a view sits on the screen, for a menu to open under it. */
export function measureAnchor(view: ComponentRef<typeof View> | null, side: 'left' | 'right', windowWidth: number): Promise<MenuAnchor | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    view.measureInWindow((x, y, w, h) => {
      if (side === 'left') resolve({ top: y + h + 6, left: Math.max(8, x) });
      else resolve({ top: y + h + 6, right: Math.max(8, windowWidth - (x + w)) });
    });
  });
}

export function MenuPanel({
  anchor,
  groups,
  label,
  onClose,
  header,
}: {
  anchor: MenuAnchor | null;
  groups: MenuGroup[];
  label: string;
  onClose: () => void;
  header?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const choose = (action: MenuAction) => {
    haptic.selection();
    onClose();
    // After the menu has gone, so a screen it opens does not slide in under it.
    setTimeout(action.onPress, 0);
  };
  return (
    <Modal visible={anchor !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the menu" testID="menu-close" />
      {anchor ? (
        <View
          style={[styles.panel, { top: anchor.top, maxHeight: Math.max(160, height - anchor.top - 24) }, anchor.left !== undefined ? { left: anchor.left } : { right: anchor.right ?? 8 }]}
          accessibilityRole="menu"
          accessibilityLabel={label}
        >
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {header}
            {groups.map((group, gi) => (
              <View key={gi} style={gi > 0 ? styles.group : null}>
                {group.title ? (
                  <Text variant="stamp" color={colors.secondary} style={styles.groupTitle}>
                    {group.title}
                  </Text>
                ) : null}
                {group.actions.map((action, ai) => {
                  const color = action.destructive ? colors.destructive : colors.label;
                  return (
                    <Touchable
                      key={action.label}
                      feedback="highlight"
                      onPress={() => choose(action)}
                      accessibilityRole="menuitem"
                      aria-checked={action.checked}
                      testID={action.testID}
                      style={[styles.item, ai > 0 ? styles.itemRule : null]}
                    >
                      <View style={styles.check}>{action.checked ? <Icon name="checkmark" size={15} color={colors.label} weight="semibold" /> : null}</View>
                      <Text variant="body" color={color} style={styles.itemLabel} numberOfLines={2}>
                        {action.label}
                      </Text>
                      {action.icon ? <Icon name={action.icon} size={18} color={color} /> : null}
                    </Touchable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

/** A square button that opens a menu. */
export function MenuButton({ menu, tone = 'light' }: { menu: BarMenu; tone?: 'dark' | 'light' }) {
  const holder = useRef<ComponentRef<typeof View>>(null);
  const { width } = useWindowDimensions();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  return (
    <View ref={holder} collapsable={false}>
      <BarButtonView
        label={menu.label}
        icon={menu.icon}
        iconOnly
        tone={tone}
        onPress={() => void measureAnchor(holder.current, 'right', width).then(setAnchor)}
        testID={menu.testID}
      />
      <MenuPanel anchor={anchor} groups={menu.groups} label={menu.label} onClose={() => setAnchor(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    minWidth: 250,
    maxWidth: 310,
    backgroundColor: colors.cell,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    boxShadow: '0 10px 30px rgba(19, 32, 40, 0.18)',
  },
  group: { borderTopWidth: 1, borderTopColor: colors.border },
  groupTitle: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 },
  item: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  itemRule: { borderTopWidth: 1, borderTopColor: colors.separator },
  check: { width: 16, alignItems: 'center' },
  itemLabel: { flex: 1 },
});
