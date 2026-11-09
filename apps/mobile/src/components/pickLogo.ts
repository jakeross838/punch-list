// The builder's logo, picked from the photos on the phone and made small enough to keep on the
// company's row: at most 600 wide and 240 tall, as a PNG so a clear background stays clear, or as a
// JPEG when the PNG would be too big.

import { isLogo } from '@punch/core';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const WIDE = 600;
const TALL = 240;

/** The logo as a data URL, or null when nothing was picked. Throws when no size will do. */
export async function pickLogo(): Promise<string | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const loaded = await ImageManipulator.manipulate(asset.uri).renderAsync();
  const scale = Math.min(1, WIDE / Math.max(1, loaded.width), TALL / Math.max(1, loaded.height));
  const sized =
    scale < 1
      ? await ImageManipulator.manipulate(asset.uri)
          .resize({ width: Math.max(1, Math.round(loaded.width * scale)), height: Math.max(1, Math.round(loaded.height * scale)) })
          .renderAsync()
      : loaded;
  const png = await sized.saveAsync({ base64: true, format: SaveFormat.PNG });
  const asPng = `data:image/png;base64,${png.base64 ?? ''}`;
  if (isLogo(asPng)) return asPng;
  const jpeg = await sized.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
  const asJpeg = `data:image/jpeg;base64,${jpeg.base64 ?? ''}`;
  if (isLogo(asJpeg)) return asJpeg;
  throw new Error('That picture is too big for the logo. Try a smaller one.');
}
