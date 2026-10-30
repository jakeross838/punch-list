// What a tap or a swipe does to an item in a list: check it off (a second tap takes it back while
// it is still showing), mark it ready, remove it with Undo, open it. Checking off a company's last
// item in a room offers to mark ready what was waiting on that company there.

import { clearHoldup, complete, freedBy, remove, reopen, restore, RuleError, tidyItem, type Item, type ItemFields } from '@punch/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fieldsOf } from '@/components/ItemForm';
import { useData } from '@/data/api';
import { haptic, useFeedback } from '@/ui';

const CHECK_DELAY = 650;

/** After an item is completed: offer to mark ready what was waiting on its company in that room. */
export function useRelease(jobId: string) {
  const data = useData();
  const feedback = useFeedback();
  const items = data.useItems(jobId);
  const companies = data.useCompanies();
  const locations = data.useLocations(jobId);
  return useCallback(
    (done: Item) => {
      const company = companies.find((c) => c.id === done.companyId)?.name;
      const freed = freedBy(done, items, company);
      if (!company || freed.length === 0) return;
      const room = locations.find((l) => l.id === done.locationId)?.label ?? 'this room';
      const count = freed.length === 1 ? '1 item' : `${freed.length} items`;
      feedback.toast({
        message: `${count} in ${room} ${freed.length === 1 ? 'was' : 'were'} waiting on ${company}`,
        action: {
          label: 'Mark Ready',
          onPress: () => {
            haptic.tap();
            void data.updateItems(freed.map((i) => ({ id: i.id, patch: clearHoldup(i, company) })));
          },
        },
      });
    },
    [companies, data, feedback, items, locations],
  );
}

export function useItemActions(jobId: string) {
  const data = useData();
  const feedback = useFeedback();
  const me = data.useMe();
  const [checking, setChecking] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const release = useRelease(jobId);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const apply = useCallback(
    async (item: Item, change: (f: ItemFields) => ItemFields): Promise<boolean> => {
      try {
        const next = change(fieldsOf(item));
        await data.updateItem(item.id, { status: next.status, completedBy: next.completedBy, completedAt: next.completedAt });
        return true;
      } catch (e) {
        haptic.warning();
        feedback.toast({ message: e instanceof RuleError ? e.message : 'That did not save. Try again.' });
        return false;
      }
    },
    [data, feedback],
  );

  const onCheck = useCallback(
    (item: Item) => {
      if (item.status === 'complete') {
        haptic.tap();
        void apply(item, reopen);
        return;
      }
      const pending = timers.current.get(item.id);
      if (pending) {
        clearTimeout(pending);
        timers.current.delete(item.id);
        setChecking((s) => new Set([...s].filter((id) => id !== item.id)));
        return;
      }
      haptic.success();
      setChecking((s) => new Set(s).add(item.id));
      timers.current.set(
        item.id,
        setTimeout(() => {
          timers.current.delete(item.id);
          void apply(item, (f) => {
            if (!me) throw new RuleError('Sign in to mark items complete');
            return complete(f, me);
          })
            .then((ok) => {
              if (ok) release(item);
            })
            .finally(() => setChecking((s) => new Set([...s].filter((id) => id !== item.id))));
        }, CHECK_DELAY),
      );
    },
    [apply, me, release],
  );

  const onReady = useCallback(
    (item: Item) => {
      haptic.tap();
      const next = tidyItem({ ...fieldsOf(item), ready: true });
      void data.updateItem(item.id, { ready: next.ready, waitingOn: next.waitingOn, readyBy: next.readyBy });
    },
    [data],
  );

  const onRemove = useCallback(
    (item: Item) => {
      haptic.heavy();
      void apply(item, remove);
      feedback.toast({
        message: `Removed ${item.title}`,
        action: { label: 'Undo', onPress: () => void data.updateItem(item.id, restore({ ...fieldsOf(item), status: 'removed' })) },
      });
    },
    [apply, data, feedback],
  );

  const onOpen = useCallback((item: Item) => router.push({ pathname: '/jobs/[jobId]/items/[itemId]', params: { jobId, itemId: item.id } }), [jobId]);

  return { checking, onCheck, onReady, onRemove, onOpen };
}
