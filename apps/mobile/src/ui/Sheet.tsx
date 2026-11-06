// iPhone: a real page sheet. It slides up, the screen behind shrinks back, and a swipe down closes
// it, following the finger. With changes not saved yet, the swipe down or Cancel asks first:
// Discard Changes or Keep Editing. A button whose action is the sheet's own onClose counts as its
// Cancel. The sheet reports when it has slid away, so the next one waits for it (presence.ts).

import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { colors } from '@/constants/theme';
import type { BarButtonProps } from './BarButton';
import { askToDiscard } from './discard';
import { useFeedback } from './Feedback';
import { useSheetPresence } from './presence';
import { SheetHeader } from './SheetHeader';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  left?: BarButtonProps;
  right?: BarButtonProps;
  children: ReactNode;
  testID?: string;
  /** Changes not saved yet: a swipe down or Cancel asks before throwing them away. */
  dirty?: boolean;
  /** What the changes are to, for the question: "this person". */
  what?: string;
}

export function Sheet({ visible, onClose, title, left, right, children, testID, dirty = false, what }: SheetProps) {
  const feedback = useFeedback();
  const dismissed = useSheetPresence(visible);
  const requestClose = () => (dirty ? askToDiscard(feedback, onClose, what) : onClose());
  const guard = (button?: BarButtonProps) => (button && button.onPress === onClose ? { ...button, onPress: requestClose } : button);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      allowSwipeDismissal={!dirty}
      onRequestClose={requestClose}
      onDismiss={dismissed}
    >
      <View style={{ flex: 1, backgroundColor: colors.grouped }} testID={testID}>
        <SheetHeader title={title} left={guard(left)} right={guard(right)} />
        {children}
      </View>
    </Modal>
  );
}
