// A photo with its marks drawn over it. The photo is scaled here, not by the image view, so the
// marks land exactly where they were drawn: cover fills the box (a thumbnail, or the item screen
// with a tall photo), contain fits the whole photo inside it (markup). A photo cropped to fill its
// box moves to keep its marks in view when they fit.

import { markBounds, type Mark } from '@punch/core';
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

/** Room kept around the marks, as a fraction of the photo's shorter side, for the ends of words and the size of a numbered dot. */
const MARK_ROOM = 0.07;

/**
 * How tall to show a photo at this width: its own height up to max, or taller when its marks need
 * the room to stay in view, up to most.
 */
export function croppedHeight(photo: PhotoLike, width: number, max: number, most: number): number {
  const full = (width * photo.height) / (photo.width || 1);
  const keep = markBounds(photo.marks);
  const needed = keep ? (keep[3] - keep[1]) * full + 2 * MARK_ROOM * Math.min(width, full) : 0;
  return Math.round(Math.min(full, Math.max(max, Math.min(needed, most))));
}

/**
 * Where a photo sits in a box: its shown size and its offset from the box's top left. Cropped to
 * cover the box, it stays centered unless that would cut off the part to keep (the marks).
 */
export function fitPhoto(
  photo: { width: number; height: number },
  box: { width: number; height: number },
  fit: 'cover' | 'contain',
  keep?: [left: number, top: number, right: number, bottom: number] | null,
) {
  const w = photo.width || 1;
  const h = photo.height || 1;
  const scale = fit === 'cover' ? Math.max(box.width / w, box.height / h) : Math.min(box.width / w, box.height / h);
  const width = w * scale;
  const height = h * scale;
  if (fit !== 'cover' || !keep) return { width, height, left: (box.width - width) / 2, top: (box.height - height) / 2 };
  const pad = MARK_ROOM * Math.min(width, height);
  return {
    width,
    height,
    left: keepInView(box.width, width, keep[0] * width - pad, keep[2] * width + pad),
    top: keepInView(box.height, height, keep[1] * height - pad, keep[3] * height + pad),
  };
}

/** The offset along one side that keeps lo to hi in view, moving as little from centered as it can. */
function keepInView(view: number, size: number, lo: number, hi: number): number {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const centered = (view - size) / 2;
  // Offsets from -lo to view - hi keep the whole part in view; when it is bigger than the view, center on it.
  const offset = hi - lo <= view ? clamp(centered, -lo, view - hi) : view / 2 - (lo + hi) / 2;
  return clamp(offset, view - size, 0);
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
  const shown = fitPhoto(photo, { width, height }, fit, fit === 'cover' ? markBounds(photo.marks) : null);
  return (
    <View style={[{ width, height, borderRadius: radius, overflow: 'hidden' }, style]} testID={testID}>
      <View style={{ position: 'absolute', left: shown.left, top: shown.top, width: shown.width, height: shown.height }}>
        <Image source={{ uri: photo.uri }} style={{ width: shown.width, height: shown.height }} contentFit="fill" transition={120} accessibilityIgnoresInvertColors />
        <MarkLayer marks={photo.marks} width={shown.width} height={shown.height} />
      </View>
    </View>
  );
});
