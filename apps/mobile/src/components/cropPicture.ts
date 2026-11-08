// Makes the picture a crop keeps, with the phone's picture tools (the browser's on the preview):
// turned and leveled in one go on a canvas that grows to hold it, then the box kept, saved as a
// JPEG. The marks move with it in the core (croppedMarks).

import { cropRect, turnedSize, type PhotoCrop } from '@punch/core';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface Picture {
  uri: string;
  width: number;
  height: number;
}

/** A photo is sent up no bigger than this on its long side anyway, so a crop starts there. */
const LONG_SIDE = 2048;

export async function cropPicture(uri: string, crop: PhotoCrop): Promise<Picture> {
  const loaded = await ImageManipulator.manipulate(uri).renderAsync();
  const original =
    Math.max(loaded.width, loaded.height) > LONG_SIDE
      ? await ImageManipulator.manipulate(uri)
          .resize(loaded.width >= loaded.height ? { width: LONG_SIDE, height: null } : { width: null, height: LONG_SIDE })
          .renderAsync()
      : loaded;
  const turned = turnedSize(original.width, original.height, crop.turns);
  const degrees = crop.turns * 90 + crop.angle;
  const canvas = degrees === 0 ? original : await ImageManipulator.manipulate(original).rotate(degrees).renderAsync();
  const kept = await ImageManipulator.manipulate(canvas).crop(cropRect(canvas.width, canvas.height, turned, crop)).renderAsync();
  const saved = await kept.saveAsync({ compress: 0.9, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
