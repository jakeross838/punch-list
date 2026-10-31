// A company's own page for a job: what the company sees from the private link sent with its list,
// with no account. Its scheduled visits, then its open work (ready now, waiting, needs a price)
// with each item's photo and where it is, and comments: on any item, or on the whole list, under
// the name typed once at the top. Ross Built sees them right away. Ross Built only notes never
// show here. In the app it opens from the company's plan, to see the page the way the company does.

import {
  companyList,
  dayOfDate,
  isDay,
  isShared,
  itemComments,
  listComments,
  visitEnd,
  type Comment,
  type ListLine,
  type Photo,
} from '@punch/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CommentThread } from '@/components/Comments';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Banner, EmptyState, ListSection, ListTextField, Page, PhotoView, shortDate, Text, Touchable, weekdayDate } from '@/ui';

export default function CompanyPageScreen() {
  const { jobId, companyId } = useLocalSearchParams<{ jobId: string; companyId: string }>();
  const data = useData();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const visits = data.useVisits(jobId);
  const locations = data.useLocations(jobId);
  const trades = data.useTrades();
  const companies = data.useCompanies();
  const comments = data.useComments(jobId);
  const [name, setName] = useState('');

  const company = companies.find((c) => c.id === companyId);
  const today = dayOfDate(new Date());
  const lookups = useMemo(() => ({ locations, trades, companies, items, visits, today }), [locations, trades, companies, items, visits, today]);
  const list = useMemo(() => companyList(companyId, items, lookups), [companyId, items, lookups]);
  const ownVisits = visits.filter((v) => v.companyId === companyId).sort((a, b) => a.start.localeCompare(b.start));
  const shared = comments.filter(isShared);
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);
  const post = (itemId: string | null) => (body: string) => void data.addCompanyComment({ jobId, companyId, itemId, body, name });
  const companyName = company?.name ?? 'Company';

  const section = (title: string, note: string | null, lines: ListLine[], key: string) =>
    lines.length > 0 ? (
      <View key={key} style={styles.section}>
        <Text variant="footnote" weight="600" color={colors.secondary} style={styles.sectionTitle}>
          {title}
        </Text>
        {note ? (
          <Text variant="footnote" color={colors.secondary} style={styles.sectionTitle}>
            {note}
          </Text>
        ) : null}
        <View style={styles.cards}>
          {lines.map((l) => (
            <TradeItem key={l.item.id} line={l} photo={firstPhoto.get(l.item.id)} comments={itemComments(shared, l.item.id)} onPost={post(l.item.id)} />
          ))}
        </View>
      </View>
    ) : null;

  return (
    <Page title={companyName} large subtitle={job ? `${job.name}, from Ross Built` : undefined} backLabel={companyName} background="grouped">
      <Banner icon="eye">{`This is the page ${companyName} opens from the link on its list. What they write here comes straight to you.`}</Banner>
      <ListSection style={styles.first} footer="So Ross Built knows who wrote. Type it once.">
        <ListTextField placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" accessibilityLabel="Your name" testID="company-name" />
      </ListSection>

      <Text variant="footnote" weight="600" color={colors.secondary} style={styles.sectionTitle}>
        Comments on the Whole List
      </Text>
      <CommentThread
        comments={listComments(shared, companyId)}
        onPost={post(null)}
        allowInternal={false}
        canTakeBack={false}
        placeholder="Anything about the whole list, like when you can come"
        testID="company-list-comments"
      />

      {ownVisits.length > 0 ? (
        <ListSection header="Scheduled Visits" footer="Tell us in a comment if these dates do not work for you." style={styles.after}>
          {ownVisits.map((v) => {
            const end = visitEnd(v);
            return (
              <View key={v.id} style={styles.visit}>
                <Text style={{ flex: 1 }}>{end === v.start ? weekdayDate(v.start) : `${weekdayDate(v.start)} to ${weekdayDate(end)}`}</Text>
                <Text variant="subheadline" color={v.confirmed ? colors.tint : colors.secondary} weight={v.confirmed ? '600' : '400'}>
                  {v.confirmed ? 'Confirmed' : 'Our best guess'}
                </Text>
              </View>
            );
          })}
        </ListSection>
      ) : null}

      {list.open === 0 ? <EmptyState icon="checkmark.circle.fill" title="Nothing Open" message="Nothing on this job is waiting on you right now." /> : null}
      {section('Ready Now', 'These can be done any time.', list.ready, 'ready')}
      {list.waiting.map((g) =>
        section(`Waiting on ${g.on}${g.readyBy ? `, ready by ${shortDate(g.readyBy)}` : ''}`, null, g.lines, `waiting-${g.on}`),
      )}
      {section('Needs a Price', 'Extra work we need a price for before it is scheduled.', list.needsPrice, 'price')}
    </Page>
  );
}

/** One item on the company's page: its photo, what and where, and its comments, with a box to add one. */
function TradeItem({ line, photo, comments, onPost }: { line: ListLine; photo?: Photo; comments: Comment[]; onPost: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const { item } = line;
  const waiting = item.ready ? null : `Waiting on ${line.waiting || 'something'}${isDay(line.readyBy) ? `, ready by ${shortDate(line.readyBy)}` : ''}`;
  return (
    <View style={styles.card} testID={`company-item-${item.id}`}>
      <View style={styles.cardTop}>
        {photo ? <PhotoView photo={photo} width={84} height={84} radius={8} /> : null}
        <View style={styles.cardText}>
          <Text weight="600">{item.title}</Text>
          <Text variant="subheadline" color={colors.secondary}>
            {line.room}
          </Text>
          {item.description ? <Text variant="callout">{item.description}</Text> : null}
          {waiting ? (
            <Text variant="subheadline" color={colors.secondary}>
              {waiting}
            </Text>
          ) : null}
        </View>
      </View>
      {comments.length > 0 || open ? (
        <CommentThread
          comments={comments}
          onPost={onPost}
          allowInternal={false}
          canTakeBack={false}
          placeholder="A question or a note about this item"
          onCard
          style={styles.cardThread}
          testID={`company-comments-${item.id}`}
        />
      ) : (
        <Touchable feedback="opacity" onPress={() => setOpen(true)} accessibilityRole="button" testID={`company-comment-${item.id}`} style={styles.comment}>
          <Text variant="subheadline" weight="600" color={colors.tint}>
            Comment
          </Text>
        </Touchable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  first: { marginTop: 14 },
  after: { marginTop: 22 },
  section: { marginTop: 22 },
  sectionTitle: { marginHorizontal: layout.margin + layout.rowPadding, marginBottom: 6 },
  cards: { marginHorizontal: layout.margin, gap: 10 },
  card: { padding: 12, borderRadius: layout.radius, backgroundColor: colors.cell, gap: 10 },
  cardTop: { flexDirection: 'row', gap: 12 },
  cardText: { flex: 1, gap: 2 },
  cardThread: { marginHorizontal: 0 },
  comment: { alignSelf: 'flex-start', height: 30, justifyContent: 'center' },
  visit: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.rowPadding, paddingVertical: 8, backgroundColor: colors.cell },
});
