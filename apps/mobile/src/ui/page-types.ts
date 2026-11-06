// What a screen says about its frame, once, for both platforms (Page.tsx draws it).

import type { ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { IconName } from './icons';

export interface BarButton {
  kind: 'button';
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  /** Shown in place of the label. */
  text?: string;
  variant?: 'plain' | 'tinted' | 'prominent';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export interface MenuAction {
  label: string;
  icon?: IconName;
  /** Shows a check: the current Group By, Show Completed when on. */
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
  /** Spread onto the list. */
  props: {
    onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle?: number;
    automaticallyAdjustKeyboardInsets?: boolean;
    keyboardShouldPersistTaps?: 'handled';
    keyboardDismissMode?: 'on-drag' | 'interactive';
  };
  /** Put first in the list header: the title block and the search field. */
  header: ReactNode;
  /** Space the list needs at the bottom. */
  bottomInset: number;
}

/** Which part of the bottom bar is lit, if any, and what Capture works on. */
export interface PageTab {
  /** Me and its screens light none. */
  active?: 'jobs' | 'send';
  /** The job the screen is on. */
  jobId?: string;
  /** Capture starts in this location. */
  locationId?: string | null;
  /** Capture does something of the screen's own. */
  onCapture?: () => void;
}

export interface PageProps {
  /** The screen's title, in the header under the bar (or the sheet's head). */
  title: string;
  /** The small line above the title: "Active · Closeout", "Location · Level 1". */
  eyebrow?: string;
  /** The color of the square stamp before the eyebrow. */
  marker?: string;
  /** A line of plain words under the title, like the address. */
  subtitle?: string;
  /** Anything else under the title: a line of counts. */
  meta?: ReactNode;
  /** A stamp caption at the top right of the header: "Sent Fri". */
  stamp?: string;
  /** Where you are, under the bar: Fish / Level 1 / Kitchen 109. */
  crumb?: string[];
  /** The screen draws its own title. */
  hideHeader?: boolean;
  /** Shown under the title and before the search: the counts and tiles on a job. */
  beforeSearch?: ReactNode;
  /** The previous screen's name, after the back chevron: "Jobs". */
  backLabel?: string;
  /** Kept for screens that still pass it; both are sand. */
  background?: 'grouped' | 'plain';
  /** More in the bar, after the back button. */
  left?: BarItem[];
  /** Square buttons on the right of the bar. */
  right?: BarItem[];
  /** The Me button in the bar, on the screens of the bottom bar. */
  account?: boolean;
  /** The job's name in the bar, with a menu to switch jobs: Send. */
  jobSwitch?: { jobId: string; onChange: (jobId: string) => void };
  /** The buttons along the bottom, like Not Done and Complete. */
  bottom?: BarButton[];
  /** A bar of the screen's own over the bottom of the content. */
  footer?: ReactNode;
  /** How tall the footer is, so the list can scroll clear of it. */
  footerHeight?: number;
  search?: {
    value: string;
    onChange: (text: string) => void;
    placeholder?: string;
    /** Kept for screens that still pass it: the field is always shown. */
    collapsed?: boolean;
    /** The Filter button beside the field. */
    filter?: { onPress: () => void; count?: number; testID?: string };
  };
  /** False for the first screen, which has nothing to go back to. */
  back?: boolean;
  /** The screen is shown as a sheet: its title in the sheet's head, no bar. */
  sheet?: boolean;
  /** The bottom bar with Jobs, Capture and Send. */
  tab?: PageTab;
  children?: ReactNode;
  /** For screens built on a list: render it with the scroll props and header from the page. */
  list?: (scroll: PageScroll) => ReactNode;
  testID?: string;
}
