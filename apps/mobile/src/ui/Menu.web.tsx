// Preview page: the iOS pull-down menu. It grows out of the "…" button, sits on frosted glass,
// and closes when you pick something or tap anywhere else.

import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { View } from 'react-native';
import { colors } from '@/constants/theme';
import { BarButtonView } from './BarButton';
import { Icon } from './Icon';
import type { BarMenu, MenuAction } from './page-types';

interface Anchor {
  top: number;
  right: number;
}

export function MenuButton({ menu }: { menu: BarMenu }) {
  const holder = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [shown, setShown] = useState(false);

  function open() {
    const node = holder.current as unknown as HTMLElement | null;
    const rect = node?.getBoundingClientRect?.();
    if (!rect) return;
    setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  }

  function close() {
    setShown(false);
    setTimeout(() => setAnchor(null), 200);
  }

  useEffect(() => {
    if (!anchor) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  function choose(action: MenuAction) {
    close();
    action.onPress();
  }

  return (
    <View ref={holder} collapsable={false}>
      <BarButtonView label={menu.label} icon={menu.icon} iconOnly onPress={open} testID={menu.testID} />
      {anchor
        ? createPortal(
            <div className="pl-menu-root" data-open={shown ? 'true' : 'false'} onClick={close}>
              <div
                className="pl-menu"
                role="menu"
                aria-label={menu.label}
                style={{ top: anchor.top, right: anchor.right }}
                onClick={(e) => e.stopPropagation()}
              >
                {menu.groups.map((group, gi) => (
                  <div className="pl-menu-group" key={gi}>
                    {group.title ? <div className="pl-menu-title">{group.title}</div> : null}
                    {group.actions.map((action) => (
                      <button
                        type="button"
                        key={action.label}
                        className="pl-menu-item"
                        role="menuitemcheckbox"
                        aria-checked={action.checked ? 'true' : 'false'}
                        data-destructive={action.destructive ? 'true' : 'false'}
                        data-testid={action.testID}
                        onClick={() => choose(action)}
                      >
                        <span className="pl-menu-check">
                          {action.checked ? <Icon name="checkmark" size={15} color={colors.label} weight="semibold" /> : null}
                        </span>
                        <span className="pl-menu-label">{action.label}</span>
                        {action.icon ? (
                          <Icon name={action.icon} size={19} color={action.destructive ? colors.destructive : colors.label} />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </View>
  );
}
