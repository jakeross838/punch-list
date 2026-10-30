// A photo full screen, marks and all, on black. Tap it or Done to close.

import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { PhotoView, type PhotoLike } from './PhotoView';
import { Text } from './Text';
import { Touchable } from './Touchable';

export function PhotoViewer({ photo, onClose }: { photo: PhotoLike | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const box = { width, height: height - insets.top - insets.bottom - 112 };
  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.bar}>
          <Touchable feedback="opacity" onPress={onClose} accessibilityRole="button" testID="viewer-done" style={styles.done}>
            <Text weight="600" color={colors.onDark}>
              Done
            </Text>
          </Touchable>
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the photo" style={styles.photo}>
          {photo ? <PhotoView photo={photo} width={box.width} height={box.height} fit="contain" /> : null}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  bar: { height: 56, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16 },
  done: { height: 44, justifyContent: 'center' },
  photo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
