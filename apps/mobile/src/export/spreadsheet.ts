// iPhone: the job's items as a spreadsheet file, handed to the share sheet: Mail, Messages, Files,
// or straight into Excel or Numbers.

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareSpreadsheet(csv: string, fileName: string, title: string): Promise<void> {
  const folder = new Directory(Paths.cache, 'lists');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, fileName);
  if (file.exists) file.delete();
  // A byte order mark first, so Excel reads the names with their accents right.
  file.write(`﻿${csv}`);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: title });
}
