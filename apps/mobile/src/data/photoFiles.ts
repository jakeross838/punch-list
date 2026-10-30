// iPhone: the camera hands back a picture in a temporary folder, so each photo is copied into the
// app's own documents, named for the photo, where it stays until it is uploaded.

import { Directory, File, Paths } from 'expo-file-system';

export async function keepPhoto(uri: string, id: string): Promise<string> {
  if (!uri.startsWith('file:')) return uri;
  const folder = new Directory(Paths.document, 'photos');
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const ext = (uri.split('?')[0]!.match(/\.(jpe?g|png|heic)$/i)?.[1] ?? 'jpg').toLowerCase();
  const kept = new File(folder, `${id}.${ext}`);
  if (!kept.exists) await new File(uri).copy(kept);
  return kept.uri;
}
