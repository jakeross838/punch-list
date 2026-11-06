// The job's plans: a picture of each level's plan with its open items pinned where they are, each
// pin a square in its status color (green ready, gray waiting, red late, blue to check). Tap a pin
// for the item; tap it again to open it. Pinch to look closer. Items on the level that are not
// pinned yet are listed under the plan: tap one, then tap the plan where it is. An item can also be
// pinned from its own screen. Add a Plan takes a picture from the phone's photos for a level.

import type { Item, PlanSheet } from '@punch/core';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { itemStatus } from '@/components/ItemRow';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { useHolds } from '@/data/view';
import {
  Button,
  EmptyState,
  haptic,
  Icon,
  LedgerRow,
  MetaLine,
  OptionPicker,
  Page,
  Panel,
  Pill,
  SectionLabel,
  Segmented,
  Stamp,
  Text,
  Touchable,
  useFeedback,
  type BarItem,
  type PillTone,
} from '@/ui';

const PIN = 13;

const TONE_COLOR: Record<PillTone, string> = {
  ok: colors.ok,
  wait: colors.quiet,
  late: colors.destructive,
  check: colors.tint,
  quote: colors.label,
  draft: colors.quiet,
  guess: colors.tint,
  done: colors.quiet,
};

export default function PlansScreen() {
  const { jobId, floor: floorParam, pin } = useLocalSearchParams<{ jobId: string; floor?: string; pin?: string }>();
  const data = useData();
  const feedback = useFeedback();
  const { width } = useWindowDimensions();
  const job = data.useJobs().find((j) => j.id === jobId);
  const plans = data.usePlans(jobId);
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const holds = useHolds(jobId);
  const floors = useMemo(() => [...new Set(locations.filter((l) => l.active).map((l) => l.floor ?? '').filter(Boolean))], [locations]);
  const pinning = pin ? items.find((i) => i.id === pin) : undefined;
  const pinningFloor = pinning ? locations.find((l) => l.id === pinning.locationId)?.floor : undefined;
  const firstPlan = plans.find((p) => p.floor === (pinningFloor ?? floorParam)) ?? plans[0];
  const [planId, setPlanId] = useState<string | null>(firstPlan?.id ?? null);
  const plan: PlanSheet | undefined = plans.find((p) => p.id === planId) ?? firstPlan;
  const [picked, setPicked] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(pin ?? null);
  const [adding, setAdding] = useState<{ uri: string; width: number; height: number } | null>(null);

  const floorOf = useMemo(() => new Map(locations.map((l) => [l.id, l.floor ?? ''])), [locations]);
  const nameOf = useMemo(() => new Map(locations.map((l) => [l.id, l.label])), [locations]);
  const companyOf = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const onLevel = plan ? open.filter((i) => floorOf.get(i.locationId) === plan.floor || i.planId === plan.id) : [];
  const pinned = plan ? onLevel.filter((i) => i.planId === plan.id && i.pinX != null && i.pinY != null) : [];
  const notPinned = plan ? onLevel.filter((i) => i.planId !== plan.id) : [];
  const toneOf = (i: Item) => itemStatus(i, { holds, company: companyOf.get(i.companyId ?? '') }).tone;
  const counts = new Map<PillTone, number>();
  for (const i of pinned) counts.set(toneOf(i), (counts.get(toneOf(i)) ?? 0) + 1);

  const boxW = width - layout.margin * 2 - 2;
  const boxH = plan ? Math.round((boxW * plan.height) / Math.max(1, plan.width)) : 0;
  const placingItem = placing ? items.find((i) => i.id === placing) : undefined;
  const pickedItem = picked ? items.find((i) => i.id === picked) : undefined;

  const tapPlan = (e: GestureResponderEvent) => {
    if (!plan) return;
    const x = Math.max(0, Math.min(1, e.nativeEvent.locationX / boxW));
    const y = Math.max(0, Math.min(1, e.nativeEvent.locationY / boxH));
    if (!placingItem) {
      setPicked(null);
      return;
    }
    const was = { planId: placingItem.planId ?? null, pinX: placingItem.pinX ?? null, pinY: placingItem.pinY ?? null };
    haptic.success();
    void data.updateItems([{ id: placingItem.id, patch: { planId: plan.id, pinX: x, pinY: y } }]);
    feedback.toast({
      message: `Pinned ${placingItem.title || 'the item'} on ${plan.name}`,
      action: { label: 'Undo', onPress: () => void data.updateItems([{ id: placingItem.id, patch: was }]) },
    });
    setPlacing(null);
    setPicked(placingItem.id);
    if (pin) router.back();
  };

  const addPlan = async () => {
    const result = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    setAdding({ uri: asset.uri, width: asset.width || 1600, height: asset.height || 1100 });
  };
  const saveNew = async (floor: string) => {
    if (!adding) return;
    const taken = plans.filter((p) => p.floor === floor).length;
    const id = await data.addPlan({ jobId, floor, name: taken > 0 ? `${floor} Plan ${taken + 1}` : `${floor} Plan`, ...adding });
    setAdding(null);
    setPlanId(id);
    haptic.success();
  };
  const takeOff = () => {
    if (!plan) return;
    feedback.actionSheet({
      title: `Take off ${plan.name}?`,
      message: 'Its pins stay with their items, so the plan can come back.',
      actions: [
        {
          label: 'Take Off the Plan',
          destructive: true,
          onPress: () => {
            void data.updatePlan(plan.id, { removed: true });
            setPlanId(null);
            feedback.toast({ message: `${plan.name} taken off`, action: { label: 'Undo', onPress: () => void data.updatePlan(plan.id, { removed: false }) } });
          },
        },
      ],
    });
  };

  const right: BarItem[] = [
    { kind: 'button', label: 'Add a Plan', icon: 'plus', iconOnly: true, onPress: () => void addPlan(), testID: 'add-plan' },
    ...(plan ? [{ kind: 'menu' as const, label: 'More', icon: 'ellipsis' as const, testID: 'plan-more', groups: [{ actions: [{ label: 'Take Off This Plan', icon: 'trash' as const, destructive: true, onPress: takeOff, testID: 'plan-remove' }] }] }] : []),
  ];

  return (
    <Page
      title={plan ? plan.floor || plan.name : 'Plans'}
      eyebrow={plan ? `Plan · ${plan.name}` : 'Plans'}
      crumb={[job?.name ?? 'Job', 'Plans', ...(plan?.floor ? [plan.floor] : [])]}
      meta={
        plan ? (
          <MetaLine
            facts={[
              { text: `${onLevel.length} open`, color: colors.label },
              `${pinned.length} pinned`,
              notPinned.length > 0 ? { text: `${notPinned.length} not pinned`, color: colors.tint } : null,
            ]}
          />
        ) : undefined
      }
      backLabel={job?.name}
      right={right}
      tab={{ active: 'jobs', jobId }}
    >
      {plans.length === 0 ? (
        <EmptyState icon="map" title="No Plans Yet" message="Add a picture of each level's plan to pin the items where they are.">
          <View style={styles.emptyAction}>
            <Button label="Add a Plan" icon="plus" onPress={() => void addPlan()} testID="empty-add-plan" />
          </View>
        </EmptyState>
      ) : plan ? (
        <>
          {plans.length > 1 ? (
            <Segmented options={plans.map((p) => [p.id, p.floor || p.name] as const)} value={plan.id} onChange={(id) => setPlanId(id)} style={styles.sheets} testID="plan-sheets" />
          ) : null}
          {placingItem ? (
            <View style={styles.placing} testID="placing">
              <Stamp color={colors.oceanside} size={7} />
              <Text variant="subheadline" color={colors.onBar} style={{ flex: 1 }}>
                Tap the plan where {placingItem.title || 'the item'} is.
              </Text>
              <Touchable feedback="opacity" onPress={() => (pin ? router.back() : setPlacing(null))} accessibilityRole="button" hitSlop={10} testID="placing-cancel">
                <Text variant="label" color={colors.oceanside}>
                  Cancel
                </Text>
              </Touchable>
            </View>
          ) : null}
          <View style={styles.planBox}>
            <ScrollView
              style={{ width: boxW, height: boxH }}
              contentContainerStyle={{ width: boxW, height: boxH }}
              maximumZoomScale={Platform.OS === 'ios' ? 5 : undefined}
              minimumZoomScale={1}
              bouncesZoom
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <Touchable feedback="none" onPress={tapPlan} accessibilityRole="image" accessibilityLabel={`${plan.name}, ${pinned.length} items pinned`} testID="plan-image" style={{ width: boxW, height: boxH }}>
                <Image source={{ uri: plan.uri }} style={{ width: boxW, height: boxH }} contentFit="fill" accessibilityIgnoresInvertColors />
              </Touchable>
              {pinned.map((i) => {
                const on = i.id === picked;
                const size = on ? PIN + 6 : PIN;
                return (
                  <Touchable
                    key={i.id}
                    feedback="opacity"
                    hitSlop={10}
                    onPress={() => (on ? router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: i.id } }) : setPicked(i.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`${i.title}, ${itemStatus(i, { holds }).text}`}
                    testID={`pin-${i.id}`}
                    style={[
                      styles.pin,
                      {
                        width: size,
                        height: size,
                        left: (i.pinX ?? 0) * boxW - size / 2,
                        top: (i.pinY ?? 0) * boxH - size / 2,
                        backgroundColor: TONE_COLOR[toneOf(i)],
                      },
                      // To Check is a hollow square, so it never reads as waiting.
                      toneOf(i) === 'check' ? styles.pinCheck : null,
                      on ? styles.pinOn : null,
                    ]}
                  />
                );
              })}
            </ScrollView>
          </View>
          <View style={styles.legend}>
            {(['ok', 'wait', 'late', 'check'] as const).map((t) =>
              counts.get(t) ? (
                <View key={t} style={styles.legendItem}>
                  {t === 'check' ? <View style={styles.legendCheck} /> : <Stamp color={TONE_COLOR[t]} size={9} />}
                  <Text variant="stamp" color={colors.secondary}>
                    {counts.get(t)} {t === 'ok' ? 'Ready' : t === 'wait' ? 'Waiting' : t === 'late' ? 'Past Due' : 'To Check'}
                  </Text>
                </View>
              ) : null,
            )}
          </View>
          {pickedItem ? (
            <Panel style={styles.picked}>
              <LedgerRow last onPress={() => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: pickedItem.id } })} testID="pin-open">
                <Text weight="500" numberOfLines={2}>
                  {pickedItem.title || 'No title yet'}
                </Text>
                <View style={styles.pickedLine}>
                  <Pill text={itemStatus(pickedItem, { holds }).text} tone={toneOf(pickedItem)} />
                  <Text variant="stamp" color={colors.secondary} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {[nameOf.get(pickedItem.locationId), companyOf.get(pickedItem.companyId ?? '')].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </LedgerRow>
            </Panel>
          ) : null}
          {notPinned.length > 0 && !placingItem ? (
            <>
              <SectionLabel label="Not pinned yet" right={`${notPinned.length}`} />
              <Text variant="footnote" color={colors.secondary} style={styles.hint}>
                Tap one, then tap the plan where it is.
              </Text>
              <Panel>
                {notPinned.slice(0, 30).map((i, n) => (
                  <LedgerRow
                    key={i.id}
                    last={n === Math.min(notPinned.length, 30) - 1}
                    stripe={n % 2 === 1}
                    chevron={false}
                    onPress={() => {
                      haptic.selection();
                      setPlacing(i.id);
                    }}
                    trail={<Icon name="pin" size={16} color={colors.tint} />}
                    testID={`place-${i.id}`}
                  >
                    <Text numberOfLines={1}>{i.title || 'No title yet'}</Text>
                    <Text variant="stamp" color={colors.secondary} numberOfLines={1}>
                      {[nameOf.get(i.locationId), companyOf.get(i.companyId ?? '')].filter(Boolean).join(' · ')}
                    </Text>
                  </LedgerRow>
                ))}
              </Panel>
            </>
          ) : null}
        </>
      ) : null}
      <OptionPicker
        visible={adding !== null}
        title="Which Level Is It?"
        options={(floors.length > 0 ? floors : ['Level 1']).map((f) => ({ value: f, label: f }))}
        value={null}
        onSelect={(f) => void saveNew(f)}
        onClose={() => setAdding(null)}
        search={false}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  emptyAction: { marginTop: 14, alignSelf: 'stretch' },
  sheets: { marginHorizontal: layout.margin, marginBottom: 10 },
  placing: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: layout.margin, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.bar },
  planBox: { marginHorizontal: layout.margin, borderWidth: layout.hairline, borderColor: colors.border, backgroundColor: colors.cell, overflow: 'hidden' },
  pin: { position: 'absolute', borderWidth: 1.5, borderColor: colors.white },
  pinOn: { borderColor: colors.bar, borderWidth: 2 },
  pinCheck: { backgroundColor: colors.white, borderColor: colors.tint, borderWidth: 3 },
  legendCheck: { width: 9, height: 9, borderWidth: 2, borderColor: colors.tint, backgroundColor: colors.white },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 8, marginHorizontal: layout.inset, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  picked: { marginTop: 10 },
  pickedLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { marginHorizontal: layout.inset, marginTop: 8 },
});
