// iPhone: a real page sheet. It slides up, the screen behind shrinks back, and a swipe down
// closes it.

import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { colors } from '@/constants/theme';
import type { BarButtonProps } from './BarButton';
import { SheetHeader } from './SheetHeader';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  left?: BarButtonProps;
  right?: BarButtonProps;
  children: ReactNode;
  testID?: string;
}

export function Sheet({ visible, onClose, title, left, right, children, testID }: SheetProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.grouped }} testID={testID}>
        <SheetHeader title={title} left={left} right={right} />
        {children}
      </View>
    </Modal>
  );
}
