// A photo with its marks drawn over it. The photo is scaled here, not by the image view, so the
// marks land exactly where they were drawn: cover fills the box (a thumbnail), contain fits the
// whole photo inside it (markup and the item screen).

import type { Mark } from '@punch/core';
import { Image } from 'expo-image';
import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { MarkLayer } from './MarkLayer';

export interface PhotoLike {
  uri: string;
  width: number;
  height: number;
  marks: Mark[];
}

/** Where a photo sits in a box: its shown size and its offset from the box's top left. */
export function fitPhoto(photo: { width: number; height: number }, box: { width: number; height: number }, fit: 'cover' | 'contain') {
  const w = photo.width || 1;
  const h = photo.height || 1;
  const scale = fit === 'cover' ? Math.max(box.width / w, box.height / h) : Math.min(box.width / w, box.height / h);
  const width = w * scale;
  const height = h * scale;
  return { width, height, left: (box.width - width) / 2, top: (box.height - height) / 2 };
}

export const PhotoView = memo(function PhotoView({
  photo,
  width,
  height,
  fit = 'cover',
  radius = 0,
  style,
  testID,
}: {
  photo: PhotoLike;
  width: number;
  height: number;
  fit?: 'cover' | 'contain';
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const shown = fitPhoto(photo, { width, height }, fit);
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden' }, style]} testID={testID}>
      <View style={{ position: 'absolute', left: shown.left, top: shown.top, width: shown.width, height: shown.height }}>
        <Image source={{ uri: photo.uri }} style={{ width: shown.width, height: shown.height }} contentFit="fill" transition={120} accessibilityIgnoresInvertColors />
        <MarkLayer marks={photo.marks} width={shown.width} height={shown.height} />
      </View>
    </View>
  );
});
