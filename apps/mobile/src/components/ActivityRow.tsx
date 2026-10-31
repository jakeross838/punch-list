// Who did what, one line at a time, for the job's Activity and each item's History: their initials,
// their name and what they did, more about it underneath, and when.

import { activityLines, activityLookups, type ActivityLine } from '@punch/core';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { Text, Touchable } from '@/ui';

/** The job's activity as lines, newest first; with an item, just that item's, where it is "it". */
export function useActivityLines(jobId: string, itemId?: string): ActivityLine[] {
  const data = useData();
  const entries = data.useActivity(jobId);
  const people = data.usePeople();
  const items = data.useItems(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const trades = data.useTrades();
  const visits = data.useVisits(jobId);
  const customFields = data.useCustomFields();
  return useMemo(() => {
    const look = activityLookups({ people, items, locations, companies, trades, visits, customFields });
    const mine = itemId ? entries.filter((e) => e.itemId === itemId) : entries;
    return activityLines(mine, look, { forItem: !!itemId });
  }, [entries, people, items, locations, companies, trades, visits, customFields, itemId]);
}

/** "JR" for Jake Ross. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

export const ActivityRow = memo(function ActivityRow({
  line,
  time,
  last,
  onPress,
  timeBelow = false,
}: {
  line: ActivityLine;
  /** "9:42 AM" in a day's list, "October 29 at 9:42 AM" on its own. */
  time: string;
  last: boolean;
  onPress?: () => void;
  /** A longer time goes under the line instead of beside it. */
  timeBelow?: boolean;
}) {
  const said = `${line.who} ${line.action}. ${line.detail} ${time}`;
  const body = (
    <>
      <View style={styles.avatar}>
        <Text variant="caption1" weight="700" color={colors.tint}>
          {initials(line.who)}
        </Text>
      </View>
      <View style={[styles.body, last ? null : styles.divider]}>
        <View style={styles.top}>
          <Text numberOfLines={3} style={styles.what}>
            <Text weight="600">{line.who}</Text> {line.action}
          </Text>
          {timeBelow ? null : (
            <Text variant="footnote" color={colors.secondary} style={styles.time}>
              {time}
            </Text>
          )}
        </View>
        {line.detail ? (
          <Text variant="subheadline" color={colors.secondary} numberOfLines={3}>
            {line.detail}
          </Text>
        ) : null}
        {timeBelow ? (
          <Text variant="footnote" color={colors.secondary}>
            {time}
          </Text>
        ) : null}
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={said} testID={`activity-${line.key}`}>
        {body}
      </View>
    );
  }
  return (
    <Touchable feedback="highlight" onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={said} testID={`activity-${line.key}`}>
      {body}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingLeft: layout.inset },
  avatar: { width: 32, height: 32, borderRadius: 16, marginTop: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#CBD8DB' },
  body: { flex: 1, gap: 2, paddingTop: 10, paddingBottom: 11, paddingRight: layout.inset },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.separator },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  what: { flex: 1 },
  time: { marginTop: 2 },
});
