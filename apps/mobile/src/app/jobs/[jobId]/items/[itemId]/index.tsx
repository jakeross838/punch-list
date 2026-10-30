// One item, everything about it in one calm place: its photos with their marks, the title and
// where exactly, what it is waiting on, and who does it. Mark Complete is the big button; only
// Ross Built marks items complete, and removing never deletes.

import { complete, itemNumberLabel, remove, reopen, restore, RuleError, tidyItem, type Item, type ItemFields, type Photo } from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fieldsOf } from '@/components/ItemForm';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { capture } from '@/data/capture';
import { dayOf, EmptyState, haptic, Icon, isBeforeToday, Page, PhotoView, PhotoViewer, shortDate, Text, Touchable, useFeedback, type IconName } from '@/ui';

export default function ItemScreen() {
  const { jobId, itemId } = useLocalSearchParams<{ jobId: string; itemId: string }>();
  const item = useData()
    .useItems(jobId)
    .find((i) => i.id === itemId);
  if (!item) {
    return (
      <Page title="Item" background="plain">
        <EmptyState icon="exclamationmark.circle.fill" title="Item Not Found" message="This item is not on this job." />
      </Page>
    );
  }
  return <ItemDetail jobId={jobId} item={item} />;
}

function ItemDetail({ jobId, item }: { jobId: string; item: Item }) {
  const data = useData();
  const feedback = useFeedback();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const me = data.useMe();
  const photos = data.usePhotos(jobId).filter((p) => p.itemId === item.id);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const fields = data.useCustomFields().filter((f) => f.active);
  const [shown, setShown] = useState(0);
  const [viewing, setViewing] = useState<Photo | null>(null);

  const room = locations.find((l) => l.id === item.locationId);
  const company = companies.find((c) => c.id === item.companyId)?.name;
  const trade = trades.find((t) => t.id === item.tradeId)?.name;
  const photo: Photo | undefined = photos[Math.min(shown, photos.length - 1)];
  const photoWidth = Math.min(screenWidth, 600) - layout.margin * 2;
  // Tall photos are cropped here to keep the item readable; tap for the whole photo.
  const photoHeight = photo ? Math.min(Math.round((photoWidth * photo.height) / (photo.width || 1)), 300) : 0;

  async function setStatus(change: (f: ItemFields) => ItemFields): Promise<boolean> {
    try {
      const next = change(fieldsOf(item));
      await data.updateItem(item.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt });
      return true;
    } catch (e) {
      haptic.warning();
      feedback.toast({ message: e instanceof RuleError ? e.message : 'That did not save. Try again.' });
      return false;
    }
  }

  async function markComplete() {
    const ok = await setStatus((f) => {
      if (!me) throw new RuleError('Sign in to mark items complete');
      return complete(f, me);
    });
    if (ok) haptic.success();
  }

  async function markReady() {
    haptic.tap();
    const next = tidyItem({ ...fieldsOf(item), ready: true });
    await data.updateItem(item.id, { ready: next.ready, waitingOn: next.waitingOn, readyBy: next.readyBy });
  }

  async function removeItem() {
    if (!(await setStatus(remove))) return;
    haptic.heavy();
    router.back();
    feedback.toast({
      message: `Removed ${item.title}`,
      action: { label: 'Undo', onPress: () => void data.updateItem(item.id, restore({ ...fieldsOf(item), status: 'removed' })) },
    });
  }

  function addPhoto() {
    capture.start({ jobId, roomId: item.locationId, itemId: item.id });
    router.push({ pathname: '/jobs/[jobId]/capture', params: { jobId } });
  }

  const late = !item.ready && item.readyBy !== null && isBeforeToday(item.readyBy);
  const who = me && item.completedBy === me.id ? me.name : 'Ross Built';
  const status: { icon: IconName; color: string; line: string; detail?: string } =
    item.status === 'complete'
      ? { icon: 'checkmark.circle.fill', color: colors.tint, line: 'Complete', detail: item.completedAt ? `By ${who} on ${dayOf(item.completedAt)}` : undefined }
      : item.status === 'removed'
        ? { icon: 'trash', color: colors.quiet, line: 'Removed from the list', detail: 'It stays in the history.' }
        : item.ready
          ? { icon: 'checkmark.circle.fill', color: colors.circle, line: 'Ready', detail: 'It can be done now.' }
          : {
              icon: late ? 'exclamationmark.circle.fill' : 'hourglass',
              color: late ? colors.destructive : colors.label,
              line: `Waiting on ${item.waitingOn ?? 'something'}`,
              detail: item.readyBy ? `Ready by ${shortDate(item.readyBy)}${late ? ', past due' : ''}` : undefined,
            };

  const details: [string, string][] = [
    ['Room', room?.label ?? 'Not set'],
    ['Company', company ?? 'Not set'],
    ['Trade', trade ?? 'Not set'],
    ['Type', item.kind === 'added_scope' ? 'Added Scope' : 'Deficiency'],
    ...(item.kind === 'added_scope' ? ([['Bought Out', item.boughtOut ? (item.poOrCo ?? 'Yes') : 'Not yet']] as [string, string][]) : []),
    ...fields.flatMap((f): [string, string][] => {
      const v = item.extra[f.id];
      if (v === null || v === undefined || v === '') return [];
      return [[f.label, typeof v === 'boolean' ? (v ? 'Yes' : 'No') : f.kind === 'date' ? shortDate(v) : v]];
    }),
  ];

  const primary =
    item.status === 'open'
      ? { label: 'Mark Complete', icon: 'checkmark' as IconName, onPress: () => void markComplete(), testID: 'mark-complete' }
      : item.status === 'complete'
        ? { label: 'Reopen', icon: 'undo' as IconName, onPress: () => void setStatus(reopen), testID: 'reopen' }
        : { label: 'Restore to List', icon: 'undo' as IconName, onPress: () => void setStatus(restore), testID: 'restore' };

  return (
    <Page
      title={item.number === null ? 'New Item' : `Item ${itemNumberLabel(item)}`}
      backLabel={room?.label}
      background="plain"
      right={[{ kind: 'button', label: 'Edit', onPress: () => router.push({ pathname: '/jobs/[jobId]/items/[itemId]/edit', params: { jobId, itemId: item.id } }), testID: 'edit' }]}
      footerHeight={66}
      footer={
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Touchable
            feedback="scale"
            onPress={primary.onPress}
            accessibilityRole="button"
            testID={primary.testID}
            style={[styles.primary, item.status === 'open' ? null : styles.primaryQuiet]}
          >
            <Icon name={primary.icon} size={18} color={item.status === 'open' ? colors.white : colors.tint} weight="bold" />
            <Text variant="headline" color={item.status === 'open' ? colors.white : colors.tint}>
              {primary.label}
            </Text>
          </Touchable>
        </View>
      }
    >
      {photo ? (
        <View style={styles.photoBlock}>
          <Touchable feedback="scale" onPress={() => setViewing(photo)} accessibilityRole="button" accessibilityLabel="Show the whole photo">
            <PhotoView photo={photo} width={photoWidth} height={photoHeight} radius={layout.radius} testID="item-photo" />
          </Touchable>
          <View style={styles.photoRow}>
            {photos.length > 1
              ? photos.map((p, i) => (
                  <Touchable
                    key={p.id}
                    feedback="scale"
                    onPress={() => setShown(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${i + 1}`}
                    style={[styles.thumb, i === shown ? styles.thumbOn : null]}
                  >
                    <PhotoView photo={p} width={44} height={44} radius={8} />
                  </Touchable>
                ))
              : null}
            <Touchable feedback="opacity" onPress={addPhoto} accessibilityRole="button" testID="add-photo" style={styles.addPhoto}>
              <Icon name="camera" size={18} color={colors.tint} />
              <Text variant="subheadline" color={colors.tint}>
                Add Photo
              </Text>
            </Touchable>
          </View>
        </View>
      ) : (
        <Touchable feedback="scale" onPress={addPhoto} accessibilityRole="button" testID="add-photo" style={styles.noPhoto}>
          <Icon name="camera" size={22} color={colors.tint} />
          <Text color={colors.tint}>Add a Photo</Text>
        </Touchable>
      )}

      <View style={styles.text}>
        <Text variant="title1" accessibilityRole="header">
          {item.title}
        </Text>
        {item.description ? <Text color={colors.secondary}>{item.description}</Text> : null}
      </View>

      <View style={styles.status}>
        <Icon name={status.icon} size={19} color={status.color} weight="semibold" style={styles.statusIcon} />
        <View style={{ flex: 1 }}>
          <Text>{status.line}</Text>
          {status.detail ? (
            <Text variant="subheadline" color={late && item.status === 'open' ? colors.destructive : colors.secondary}>
              {status.detail}
            </Text>
          ) : null}
        </View>
        {item.status === 'open' && !item.ready ? (
          <Touchable feedback="scale" onPress={() => void markReady()} accessibilityRole="button" testID="mark-ready" style={styles.ready}>
            <Text variant="subheadline" weight="600" color={colors.tint}>
              Mark Ready
            </Text>
          </Touchable>
        ) : null}
      </View>

      <View style={styles.details}>
        {details.map(([label, value], i) => (
          <View key={label} style={[styles.detail, i > 0 ? styles.detailRule : null]}>
            <Text color={colors.secondary}>{label}</Text>
            <Text numberOfLines={1} style={styles.detailValue}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {item.status !== 'removed' ? (
        <Touchable feedback="opacity" onPress={() => void removeItem()} accessibilityRole="button" testID="remove" style={styles.remove}>
          <Text color={colors.destructive}>Remove from List</Text>
        </Touchable>
      ) : null}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  photoBlock: { paddingHorizontal: layout.margin, paddingTop: 4, gap: 10 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { borderRadius: 10, padding: 2 },
  thumbOn: { borderWidth: 2, borderColor: colors.tint, padding: 0 },
  addPhoto: { marginLeft: 'auto', height: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noPhoto: { marginHorizontal: layout.margin, marginTop: 4, height: 96, borderRadius: layout.radius, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: { paddingHorizontal: layout.inset, paddingTop: 14, gap: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.inset, paddingTop: 18 },
  statusIcon: { alignSelf: 'flex-start', marginTop: 2 },
  ready: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  details: { marginHorizontal: layout.margin, marginTop: 22, paddingHorizontal: 16, borderRadius: layout.radius, backgroundColor: colors.surface },
  detail: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailRule: { borderTopWidth: 1, borderTopColor: colors.rule },
  detailValue: { flexShrink: 1, textAlign: 'right' },
  remove: { alignSelf: 'flex-start', height: 44, justifyContent: 'center', marginHorizontal: layout.inset, marginTop: 14 },
  footer: { paddingTop: 10, paddingHorizontal: layout.margin, backgroundColor: 'rgba(255, 255, 255, 0.96)', borderTopWidth: 1, borderTopColor: colors.separator },
  primary: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.tint },
  primaryQuiet: { backgroundColor: colors.surface },
});
