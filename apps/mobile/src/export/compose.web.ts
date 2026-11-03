// Preview page: nothing is sent from here. The screen shows the email or text as it would be
// written instead, and Mark Sent records it.

import * as Clipboard from 'expo-clipboard';
import type { File } from 'expo-file-system';

export type Delivery = 'sent' | 'saved' | 'cancelled' | 'unknown' | 'unavailable';

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  files: File[];
}

export async function composeEmail(_email: OutgoingEmail): Promise<Delivery> {
  return 'unavailable';
}

export async function composeText(_text: { phones: string[]; body: string; files: File[] }): Promise<Delivery> {
  return 'unavailable';
}

/** Puts the text on the clipboard; false when the browser says no (the page is not in front, say). */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
