// iPhone: the live camera, and the photo library. take() returns the photo, or null when nothing
// was taken. The camera asks for permission the first time; if it was turned off, this says where
// to turn it back on.

import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { colors } from '@/constants/theme';
import { Text, Touchable } from '@/ui';

export interface TakenPhoto {
  uri: string;
  width: number;
  height: number;
}

export interface ViewfinderHandle {
  take(): Promise<TakenPhoto | null>;
  pick(): Promise<TakenPhoto | null>;
}

export function Viewfinder({ ref, flash }: { ref?: Ref<ViewfinderHandle>; flash: boolean }) {
  const [permission, request] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  useImperativeHandle(ref, () => ({
    async take() {
      const shot = await camera.current?.takePictureAsync({ quality: 0.7 });
      return shot ? { uri: shot.uri, width: shot.width, height: shot.height } : null;
    },
    async pick() {
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      const asset = result.canceled ? null : result.assets[0];
      return asset ? { uri: asset.uri, width: asset.width || 1200, height: asset.height || 1600 } : null;
    },
  }));

  if (!permission) return <View style={styles.fill} />;
  if (!permission.granted) {
    return (
      <View style={[styles.fill, styles.ask]}>
        <Text color={colors.onDark} align="center">
          {permission.canAskAgain ? 'Punch List uses the camera to take photos of items.' : 'The camera is off for Punch List. Turn it on in Settings.'}
        </Text>
        <Touchable
          feedback="scale"
          onPress={() => (permission.canAskAgain ? void request() : void Linking.openSettings())}
          accessibilityRole="button"
          style={styles.askButton}
        >
          <Text variant="headline" color={colors.black}>
            {permission.canAskAgain ? 'Allow Camera' : 'Open Settings'}
          </Text>
        </Touchable>
      </View>
    );
  }
  return <CameraView ref={camera} style={styles.fill} facing="back" flash={flash ? 'on' : 'off'} />;
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.black },
  ask: { alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 40 },
  askButton: { height: 46, paddingHorizontal: 24, borderRadius: 23, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
