// iPhone: a printed list becomes a PDF. The page that turns into the PDF cannot load files from the
// phone, so the house font and each photo (shrunk to print size) are written into the page itself,
// and the footer with the page numbers is added after. The PDF opens in the phone's own viewer,
// where the share button sends it by email or text.

import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { printPage, type Printout } from '@punch/core';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { stampFooter } from './footer';

const FONTS: [weight: number, module: number][] = [
  [400, NunitoSans_400Regular],
  [600, NunitoSans_600SemiBold],
  [700, NunitoSans_700Bold],
];

/** The house margin, three quarters of an inch, in points. */
const MARGIN = 54;

let fonts: Promise<string> | null = null;
let footerFont: Promise<Uint8Array | null> | null = null;

/** The house font's regular weight as bytes, for the footer. */
function footerFontBytes(): Promise<Uint8Array | null> {
  footerFont ??= (async () => {
    const asset = Asset.fromModule(NunitoSans_400Regular);
    await asset.downloadAsync();
    return new File(asset.localUri ?? asset.uri).bytes();
  })().catch(() => {
    footerFont = null;
    return null;
  });
  return footerFont;
}

/** The house font, written into the page. Without it the page falls back to the system font. */
export function printFonts(): Promise<string> {
  fonts ??= Promise.all(
    FONTS.map(async ([weight, module]) => {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      const data = await new File(asset.localUri ?? asset.uri).base64();
      return `@font-face{font-family:'Nunito Sans';font-weight:${weight};font-style:normal;src:url(data:font/ttf;base64,${data}) format('truetype')}`;
    }),
  )
    .then((rules) => rules.join(''))
    .catch(() => {
      fonts = null;
      return '';
    });
  return fonts;
}

const shrunk = new Map<string, Promise<string>>();

/** A photo at print size, as data the page can hold. Drawings and pictures already held as data pass through. */
export function printPhoto(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return Promise.resolve(uri);
  let done = shrunk.get(uri);
  if (!done) {
    done = (async () => {
      const image = await ImageManipulator.manipulate(uri).resize({ width: 560 }).renderAsync();
      const saved = await image.saveAsync({ base64: true, compress: 0.62, format: SaveFormat.JPEG });
      return `data:image/jpeg;base64,${saved.base64 ?? ''}`;
    })();
    done.catch(() => shrunk.delete(uri));
    shrunk.set(uri, done);
  }
  return done;
}

/** Makes the PDF, named for the list, in the phone's cache, with the footer on every page. */
export async function makePdf(printout: Printout, footer: string): Promise<File> {
  const html = printPage(printout, { fontCss: await printFonts(), pageMargins: Platform.OS !== 'ios' });
  const { uri } = await Print.printToFileAsync({
    html,
    width: 612,
    height: 792,
    margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
  });
  const folder = new Directory(Paths.cache, 'lists');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const out = new File(folder, printout.fileName);
  if (out.exists) out.delete();
  const made = new File(uri);
  try {
    out.write(await stampFooter(await made.bytes(), footer, await footerFontBytes()));
    made.delete();
  } catch {
    // Without the footer the list still goes out.
    await made.move(out);
  }
  return out;
}

/** Opens the PDF to look over, with the share button to send it. */
export async function showPdf(file: File, title: string): Promise<void> {
  if (await file.canPreview({ mimeType: 'application/pdf' })) {
    await file.preview({ title, mimeType: 'application/pdf' });
    return;
  }
  await sharePdf(file, title);
}

/** Straight to the share sheet: Mail, Messages, AirDrop or Files. */
export async function sharePdf(file: File, title: string): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
}
