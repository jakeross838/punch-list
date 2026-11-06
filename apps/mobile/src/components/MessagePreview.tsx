// What goes out with a list, as it will be written: the email (to, copies, blind copies, subject and
// body), or the text, or that nobody at the company gets its lists yet. The preview page shows it
// over the list, since nothing is sent from there; on the iPhone, Mail or Messages opens with it.

import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { Button, Text } from '@/ui';

export type Message =
  | { by: 'email'; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string; names: string[] }
  | { by: 'text'; phones: string[]; body: string; names: string[] }
  | { by: 'none'; company: string };

/** "Mike Sample", "Mike Sample and Dave Sample", "Mike, Dave and 3 more" */
export function namesText(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

function Line({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.line} testID={testID}>
      <Text variant="footnote" color={colors.secondary} style={styles.label}>
        {label}
      </Text>
      <Text variant="subheadline" style={{ flex: 1 }} selectable>
        {value}
      </Text>
    </View>
  );
}

export function MessagePreview({ message, attachments, onAddPeople, note }: { message: Message; attachments: string[]; onAddPeople?: () => void; note?: string }) {
  if (message.by === 'none') {
    return (
      <View style={styles.card} testID="message-none">
        <Text variant="subheadline">{`Nobody at ${message.company} gets its lists yet. Add their people to send it straight to them; until then it goes from the share sheet, to whoever you pick.`}</Text>
        {onAddPeople ? (
          <View style={styles.button}>
            <Button label="Add People" icon="plus" variant="tinted" onPress={onAddPeople} testID="message-add-people" />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.card} testID={`message-${message.by}`}>
      {message.by === 'email' ? (
        <>
          {message.to.length > 0 ? <Line label="To" value={message.to.join(', ')} testID="message-to" /> : null}
          {message.cc.length > 0 ? <Line label="Cc" value={message.cc.join(', ')} testID="message-cc" /> : null}
          {message.bcc.length > 0 ? <Line label="Bcc" value={message.bcc.join(', ')} testID="message-bcc" /> : null}
          <Line label="Subject" value={message.subject} testID="message-subject" />
        </>
      ) : (
        <Line label="Text To" value={`${namesText(message.names)}, ${message.phones.join(', ')}`} testID="message-phones" />
      )}
      <Line label="Attached" value={attachments.join(', ')} />
      <Text variant="subheadline" style={styles.body} selectable testID="message-body">
        {message.body}
      </Text>
      {note ? (
        <Text variant="footnote" color={colors.secondary} style={styles.note} testID="message-note">
          {note}
        </Text>
      ) : null}
      {note && onAddPeople ? (
        <View style={styles.button}>
          <Button label="Add People" icon="plus" variant="tinted" onPress={onAddPeople} testID="message-add-people" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 10, marginBottom: 6, padding: layout.rowPadding, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.cell, gap: 6 },
  line: { flexDirection: 'row', gap: 10, alignItems: 'baseline' },
  label: { width: 62 },
  body: { marginTop: 8, paddingTop: 10, borderTopWidth: layout.hairline, borderTopColor: colors.separator },
  note: { marginTop: 4 },
  button: { marginTop: 8, alignItems: 'flex-start' },
});
