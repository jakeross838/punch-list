// What a screen says about its bar, once, for both platforms. The iPhone turns it into the native
// navigation bar, toolbar and menus (Page.tsx); the preview page draws the same thing (Page.web.tsx).

import type { ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { IconName } from './icons';

export interface BarButton {
  kind: 'button';
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  /** Shown in place of the label, like "Jobs" after the back chevron. */
  text?: string;
  variant?: 'plain' | 'tinted' | 'prominent';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export interface MenuAction {
  label: string;
  icon?: IconName;
  /** Shows a checkmark: the current Group By, Show Completed when on. */
  checked?: boolean;
  destructive?: boolean;
  onPress: () => void;
  testID?: string;
}

export interface MenuGroup {
  title?: string;
  actions: MenuAction[];
}

export interface BarMenu {
  kind: 'menu';
  label: string;
  icon: IconName;
  groups: MenuGroup[];
  testID?: string;
}

export type BarItem = BarButton | BarMenu;

export interface PageScroll {
  /** Spread onto the list: scroll tracking on the preview page, inset handling on the iPhone. */
  props: {
    onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle?: number;
    contentInsetAdjustmentBehavior?: 'automatic';
    automaticallyAdjustKeyboardInsets?: boolean;
    keyboardShouldPersistTaps?: 'handled';
    keyboardDismissMode?: 'on-drag' | 'interactive';
  };
  /** Put first in the list header: the large title on the preview page, and the subtitle. */
  header: ReactNode;
  /** Space the list needs at the bottom to clear the toolbar. */
  bottomInset: number;
}

export interface PageProps {
  title: string;
  /** A large title that shrinks into the bar as you scroll. */
  large?: boolean;
  subtitle?: string;
  /** A small line above the large title, like "Ross Built" over "Jobs". Preview page only. */
  eyebrow?: string;
  /** The previous screen's title, shown after the back chevron: "Jobs". */
  backLabel?: string;
  background?: 'grouped' | 'plain';
  left?: BarItem[];
  right?: BarItem[];
  /** The bottom toolbar, like New Item in Reminders. */
  bottom?: BarButton[];
  search?: { value: string; onChange: (text: string) => void; placeholder?: string };
  /** False for the first screen, which has nothing to go back to. */
  back?: boolean;
  /** The screen is shown as a sheet: small title, Cancel and Done in the bar, no back button. */
  sheet?: boolean;
  /** False keeps a sheet from closing with a swipe, for unsaved changes. */
  dismissible?: boolean;
  children?: ReactNode;
  /** For screens built on a list: render it with the scroll props and header from the page. */
  list?: (scroll: PageScroll) => ReactNode;
  testID?: string;
}
