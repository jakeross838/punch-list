// The scrolling part of a sheet, as on the iPhone's own forms: the field being typed in stays above
// the keyboard, a drag down puts the keyboard away, and a tap on a row or button works the first
// time instead of only closing the keyboard.

import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

export function SheetScroll(props: ScrollViewProps) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets
      {...props}
    />
  );
}
