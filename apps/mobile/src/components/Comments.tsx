// Comments: the back and forth on an item, or on a company's whole list, oldest first. Each says who
// wrote it and when; the company's own are set apart, and a Ross Built only note says so. Below,
// a box to add one. In the app, Ross Built Only keeps a comment inside Ross Built: never on the
// company's page or a printed list. Tap your own comment to take it back (with Undo).

import { commentAuthor, tidyComment, type Comment } from '@punch/core';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, type as typeScale } from '@/constants/theme';
import { useData } from '@/data/api';
import { Chip, haptic, Icon, Text, Touchable, useFeedback, whenOf } from '@/ui';

export function CommentThread({
  comments,
  onPost,
  placeholder = 'Add a comment',
  allowInternal = true,
  canTakeBack = true,
  onCard = false,
  hint,
  style,
  testID,
}: {
  comments: Comment[];
  /** Posts a comment; internal: Ross Built only. */
  onPost: (body: string, internal: boolean) => void;
  placeholder?: string;
  /** In the app; the company's page has no Ross Built only notes. */
  allowInternal?: boolean;
  /** Your own comments can be taken back in the app, not from the company's page. */
  canTakeBack?: boolean;
  /** Inside a white card: the comments and the box are set on gray instead. */
  onCard?: boolean;
  style?: StyleProp<ViewStyle>;
  /** One line under the box, like who will see it. */
  hint?: string;
  testID?: string;
}) {
  const data = useData();
  const feedback = useFeedback();
  const me = data.useMe();
  const people = data.usePeople();
  const companies = data.useCompanies();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const look = useMemo(
    () => ({ people: new Map(people.map((p) => [p.id, p.name])), companies: new Map(companies.map((c) => [c.id, c.name])) }),
    [people, companies],
  );
  const body = tidyComment(text);

  function post() {
    if (!body) return;
    haptic.success();
    onPost(body, allowInternal && internal);
    setText('');
    setInternal(false);
  }

  function takeBack(c: Comment) {
    feedback.actionSheet({
      message: c.internal ? 'It comes off the item.' : "It comes off the item and the company's page.",
      actions: [
        {
          label: 'Take Back Comment',
          destructive: true,
          onPress: () => {
            haptic.heavy();
            void data.setCommentRemoved(c.id, true);
            feedback.toast({ message: 'Comment taken back', action: { label: 'Undo', onPress: () => void data.setCommentRemoved(c.id, false) } });
          },
        },
      ],
    });
  }

  return (
    <View style={[styles.thread, style]} testID={testID}>
      {comments.map((c) => {
        const mine = canTakeBack && !c.fromCompany && c.personId === me?.id;
        const bubble = (
          <View style={[styles.bubble, onCard ? styles.gray : null, c.fromCompany ? styles.theirs : c.internal ? styles.internal : null]}>
            <View style={styles.byLine}>
              <Text variant="footnote" weight="600" style={{ flexShrink: 1 }} numberOfLines={1}>
                {commentAuthor(c, look)}
              </Text>
              <Text variant="footnote" color={colors.secondary}>
                {whenOf(c.createdAt)}
              </Text>
            </View>
            <Text variant="callout">{c.body}</Text>
            {c.internal ? (
              <View style={styles.internalTag}>
                <Icon name="eye.slash" size={11} color={colors.secondary} />
                <Text variant="caption1" color={colors.secondary}>
                  Ross Built only
                </Text>
              </View>
            ) : null}
          </View>
        );
        return mine ? (
          <Touchable key={c.id} feedback="opacity" onPress={() => takeBack(c)} accessibilityRole="button" accessibilityHint="Take it back" testID={`comment-${c.id}`}>
            {bubble}
          </Touchable>
        ) : (
          <View key={c.id} testID={`comment-${c.id}`}>
            {bubble}
          </View>
        );
      })}
      <View style={[styles.box, onCard ? styles.gray : null]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.tint}
          multiline
          autoCapitalize="sentences"
          accessibilityLabel={placeholder}
          testID={testID ? `${testID}-input` : undefined}
          style={styles.input}
        />
        <View style={styles.boxRow}>
          {allowInternal ? (
            <Chip
              label="Ross Built Only"
              icon="eye.slash"
              on={internal}
              onPress={() => {
                haptic.selection();
                setInternal((x) => !x);
              }}
              testID={testID ? `${testID}-internal` : undefined}
            />
          ) : null}
          <Touchable
            feedback="scale"
            onPress={post}
            disabled={!body}
            accessibilityRole="button"
            accessibilityLabel="Post the comment"
            testID={testID ? `${testID}-post` : undefined}
            style={[styles.post, body ? null : styles.postOff]}
          >
            <Text variant="subheadline" weight="600" color={colors.white}>
              Post
            </Text>
          </Touchable>
        </View>
      </View>
      {hint ? (
        <Text variant="footnote" color={colors.secondary} style={styles.hint}>
          {internal ? 'Only Ross Built sees this one.' : hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { marginHorizontal: layout.margin, gap: 8 },
  bubble: { padding: 10, paddingTop: 8, borderRadius: layout.radius, backgroundColor: colors.cell, gap: 2 },
  gray: { backgroundColor: colors.surface },
  theirs: { backgroundColor: colors.chipOn },
  internal: { borderWidth: 1, borderColor: colors.rule, borderStyle: 'dashed' },
  byLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  internalTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  box: { padding: 10, borderRadius: layout.radius, backgroundColor: colors.cell, gap: 8 },
  input: { ...typeScale.callout, minHeight: 40, maxHeight: 160, padding: 0, color: colors.label, outlineWidth: 0, textAlignVertical: 'top' },
  boxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  post: { marginLeft: 'auto', height: 30, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tint },
  postOff: { opacity: 0.4 },
  hint: { marginHorizontal: layout.rowPadding },
});
