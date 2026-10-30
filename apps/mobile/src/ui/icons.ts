// The icons the app uses. On the iPhone each one is the matching SF Symbol; on the preview page
// the same names draw simple line icons in the same spirit (Icon.web.tsx).

import type { SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

type SFSymbolName = Extract<SymbolViewProps['name'], string>;

export const SF_SYMBOLS = {
  'chevron.right': 'chevron.right',
  'chevron.left': 'chevron.left',
  'chevron.down': 'chevron.down',
  'chevron.up.chevron.down': 'chevron.up.chevron.down',
  plus: 'plus',
  'plus.circle.fill': 'plus.circle.fill',
  ellipsis: 'ellipsis',
  'ellipsis.circle': 'ellipsis.circle',
  checkmark: 'checkmark',
  xmark: 'xmark',
  'xmark.circle.fill': 'xmark.circle.fill',
  magnifyingglass: 'magnifyingglass',
  'house.fill': 'house.fill',
  door: 'door.left.hand.closed',
  'person.2.fill': 'person.2.fill',
  wrench: 'wrench.and.screwdriver.fill',
  hourglass: 'hourglass',
  calendar: 'calendar',
  'checkmark.circle.fill': 'checkmark.circle.fill',
  slider: 'slider.horizontal.3',
  grid: 'square.grid.2x2',
  eye: 'eye',
  'eye.slash': 'eye.slash',
  trash: 'trash',
  undo: 'arrow.uturn.backward',
  clipboard: 'doc.on.clipboard',
  'info.circle': 'info.circle',
  'exclamationmark.circle.fill': 'exclamationmark.circle.fill',
  'list.bullet': 'list.bullet',
  number: 'number',
  cart: 'cart.fill',
  'plus.app.fill': 'plus.app.fill',
  'minus.circle.fill': 'minus.circle.fill',
  building: 'building.2.fill',
  camera: 'camera',
  'photo.on.rectangle': 'photo.on.rectangle',
  bolt: 'bolt',
  'bolt.slash': 'bolt.slash',
  'pencil.tip': 'pencil.tip',
  'arrow.up.right': 'arrow.up.right',
  circle: 'circle',
  square: 'square',
  ruler: 'ruler',
  '1.circle': '1.circle',
  textformat: 'textformat',
  rooms: 'square.split.2x2',
  filter: 'line.3.horizontal.decrease',
  checklist: 'checklist',
  share: 'square.and.arrow.up',
  doc: 'doc.text',
  sparkles: 'sparkles',
  'calendar.badge.clock': 'calendar.badge.clock',
} as const satisfies Record<string, SFSymbolName>;

export type IconName = keyof typeof SF_SYMBOLS;

export type IconWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle>;
}
