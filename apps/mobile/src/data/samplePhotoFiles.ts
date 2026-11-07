// The Sample Job's drawn photos and plan, carried in the app (tools/sample-photos.mjs draws them),
// as pictures the data layer keeps and uploads like any other.

import type { SamplePhotoName } from '@punch/core';
import { Asset } from 'expo-asset';
import type { SamplePhotoFiles } from './sampleJob';

const FILES: Record<SamplePhotoName, number> = {
  'range-wall': require('../../assets/sample/range-wall.jpg'),
  'range-open': require('../../assets/sample/range-open.jpg'),
  'tub-corner': require('../../assets/sample/tub-corner.jpg'),
  outlet: require('../../assets/sample/outlet.jpg'),
  'closet-door': require('../../assets/sample/closet-door.jpg'),
  laundry: require('../../assets/sample/laundry.jpg'),
  'tv-wall': require('../../assets/sample/tv-wall.jpg'),
  vanity: require('../../assets/sample/vanity.jpg'),
  'shower-valve': require('../../assets/sample/shower-valve.jpg'),
  'plan-level-1': require('../../assets/sample/plan-level-1.jpg'),
};

/** Each one ready to keep: a file on the iPhone, an address on the preview page. */
export async function samplePhotoFiles(): Promise<SamplePhotoFiles> {
  const out = {} as SamplePhotoFiles;
  for (const [name, file] of Object.entries(FILES) as [SamplePhotoName, number][]) {
    const asset = Asset.fromModule(file);
    await asset.downloadAsync();
    const plan = name === 'plan-level-1';
    out[name] = { uri: asset.localUri ?? asset.uri, width: asset.width ?? (plan ? 1600 : 1170), height: asset.height ?? (plan ? 1100 : 1560) };
  }
  return out;
}
