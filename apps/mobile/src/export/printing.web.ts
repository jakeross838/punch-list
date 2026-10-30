// Preview page: the lists are shown on the page itself instead of as a PDF (the preview cannot
// make files or open the share sheet). The font loads from the page, and photos are used as they are.

import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import type { Printout } from '@punch/core';
import { Asset } from 'expo-asset';
import type { File } from 'expo-file-system';

const FONTS: [weight: number, module: number][] = [
  [400, NunitoSans_400Regular],
  [600, NunitoSans_600SemiBold],
  [700, NunitoSans_700Bold],
];

export async function printFonts(): Promise<string> {
  return FONTS.map(
    ([weight, module]) =>
      `@font-face{font-family:'Nunito Sans';font-weight:${weight};font-style:normal;src:url(${Asset.fromModule(module).uri}) format('truetype')}`,
  ).join('');
}

export async function printPhoto(uri: string): Promise<string> {
  return uri;
}

const ONLY_ON_THE_PHONE = 'PDFs are made on the iPhone';

export async function makePdf(_printout: Printout, _footer: string): Promise<File> {
  throw new Error(ONLY_ON_THE_PHONE);
}

export async function showPdf(_file: File, _title: string): Promise<void> {
  throw new Error(ONLY_ON_THE_PHONE);
}

export async function sharePdf(_file: File, _title: string): Promise<void> {
  throw new Error(ONLY_ON_THE_PHONE);
}
