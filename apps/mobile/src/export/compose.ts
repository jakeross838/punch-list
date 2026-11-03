// Sending from the iPhone. Mail opens with the email written and the PDFs attached, addressed to
// the people at the company (or, for the Schedule Email, to you, the team and every company); a
// company whose people have only a phone gets a text with the list attached. Without Apple Mail set
// up (someone on the Outlook app, say) the answer is unavailable, and the screen copies the
// addresses and opens the share sheet instead, to pick the app and paste them in.

import * as Clipboard from 'expo-clipboard';
import type { File } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import * as SMS from 'expo-sms';
import { Platform } from 'react-native';

/** What happened: sent, saved as a draft, cancelled, not known (Android never says), or no way to send it here. */
export type Delivery = 'sent' | 'saved' | 'cancelled' | 'unknown' | 'unavailable';

export interface OutgoingEmail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  /** The PDFs, in order. */
  files: File[];
}

export async function composeEmail(email: OutgoingEmail): Promise<Delivery> {
  if (!(await MailComposer.isAvailableAsync())) return 'unavailable';
  const { status } = await MailComposer.composeAsync({
    recipients: email.to,
    ccRecipients: email.cc ?? [],
    bccRecipients: email.bcc ?? [],
    subject: email.subject,
    body: email.body,
    attachments: email.files.map((f) => f.uri),
  });
  return status === 'sent' ? 'sent' : status === 'saved' ? 'saved' : status === 'cancelled' ? 'cancelled' : 'unknown';
}

export async function composeText(text: { phones: string[]; body: string; files: File[] }): Promise<Delivery> {
  if (!(await SMS.isAvailableAsync())) return 'unavailable';
  const { result } = await SMS.sendSMSAsync(text.phones, text.body, {
    // Android hands the file to the messages app by a content address; the iPhone takes the file itself.
    attachments: text.files.map((f) => ({ uri: Platform.OS === 'android' ? f.contentUri : f.uri, mimeType: 'application/pdf', filename: f.name })),
  });
  return result === 'sent' ? 'sent' : result === 'cancelled' ? 'cancelled' : 'unknown';
}

/** Puts the text on the clipboard; false when it could not. */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
