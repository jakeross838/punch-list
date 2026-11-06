// iPhone: the live camera, and the photo library. take() returns the photo, or null when nothing
// was taken. The camera asks for permission the first time; if it was turned off, this says where
// to turn it back on. Pinch to zoom in, as in the Camera app; 1x goes back.

import { CameraView, useCameraPermissions } from 'expo-camera';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { GestureDetector, usePinchGesture } from 'react-native-gesture-handler';
import { colors } from '@/constants/theme';
import { haptic, Text, Touchable } from '@/ui';

/**
 * The camera's zoom runs from 0 (none) to 1 (all the phone can do), and each step multiplies the
 * magnification. This much per doubling of the pinch makes a pinch about double the picture.
 */
const PER_DOUBLING = 0.125;
/** Past this, the picture is mostly blur. */
const MOST_ZOOM = 0.5;
const clampZoom = (z: number) => Math.min(MOST_ZOOM, Math.max(0, z));

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
  const [zoom, setZoom] = useState(0);
  const pinchFrom = useRef(0);
  const pinch = usePinchGesture({
    runOnJS: true,
    onActivate: () => {
      pinchFrom.current = zoom;
    },
    onUpdate: (e) => {
      setZoom(clampZoom(pinchFrom.current + (Math.log(e.scale) / Math.LN2) * PER_DOUBLING));
    },
  });

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
  return (
    <GestureDetector gesture={pinch}>
      <View style={styles.fill} collapsable={false}>
        <CameraView ref={camera} style={styles.fill} facing="back" flash={flash ? 'on' : 'off'} zoom={zoom} />
        {zoom > 0.005 ? (
          <Touchable
            feedback="opacity"
            onPress={() => {
              haptic.selection();
              setZoom(0);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Zoom out all the way"
            testID="camera-zoom-reset"
            style={styles.zoomReset}
          >
            <Text variant="footnote" weight="700" color={colors.white}>
              1×
            </Text>
          </Touchable>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.black },
  ask: { alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 40 },
  askButton: { height: 46, paddingHorizontal: 24, backgroundColor: colors.onDark, alignItems: 'center', justifyContent: 'center' },
  zoomReset: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
