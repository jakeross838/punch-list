// Preview page: a picture from the camera or the photo library is already a blob or data URL that
// this tab can show, so it is kept as it is.

export async function keepPhoto(uri: string, _id: string): Promise<string> {
  return uri;
}
