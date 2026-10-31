// What a tap or a swipe does to an item in a list: check it off (a second tap takes it back while
// it is still showing, and Undo after), mark it ready, remove it with Undo, open it. Checking off a
// task makes ready what waited on it, with Undo for both; checking off a company's last item in a
// location offers to mark ready what was waiting on that company there by name.

import { clearHoldup, complete, freedBy, releasedBy, remove, reopen, restore, RuleError, tidyItem, type Item, type ItemFields } from '@punch/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fieldsOf } from '@/components/ItemForm';
import { useData } from '@/data/api';
import { haptic, useFeedback } from '@/ui';

const CHECK_DELAY = 650;

/**
 * After an item is completed (call it with the items as they were before): what waited on it is
 * ready now, since saving it freed them, said with Undo for all of it. Otherwise, for work that
 * waits on its company by name, an offer to mark that ready. Says whether it said anything.
 */
export function useRelease(jobId: string) {
  const data = useData();
  const feedback = useFeedback();
  const items = data.useItems(jobId);
  const companies = data.useCompanies();
  return useCallback(
    (done: Item, undoDone: () => void): boolean => {
      const freed = releasedBy(done.id, items);
      if (freed.length > 0) {
        const ready = freed.filter((r) => r.ready);
        const one = freed.length === 1 ? freed[0]!.item.title : undefined;
        const what =
          ready.length === 1
            ? `${ready[0]!.item.title} is ready now`
            : ready.length > 1
              ? `${ready.length} items are ready now`
              : one
                ? `${one} no longer waits on it`
                : `${freed.length} items no longer wait on it`;
        feedback.toast({
          message: `Completed ${done.title}. ${what}.`,
          action: {
            label: 'Undo',
            onPress: () => {
              undoDone();
              void data.updateItems(
                freed.map(({ item }) => ({ id: item.id, patch: { ready: item.ready, waitingOn: item.waitingOn, waitingOnItems: item.waitingOnItems, readyBy: item.readyBy } })),
              );
            },
          },
        });
        return true;
      }
      const company = companies.find((c) => c.id === done.companyId)?.name;
      const waiting = freedBy(done, items, company);
      if (!company || waiting.length === 0) return false;
      const what = waiting.length === 1 ? waiting[0]!.title || '1 item here' : `${waiting.length} items here`;
      feedback.toast({
        message: `${what} ${waiting.length === 1 ? 'was' : 'were'} waiting on ${company}. Ready now?`,
        action: {
          label: 'Mark Ready',
          onPress: () => {
            haptic.tap();
            void data.updateItems(waiting.map((i) => ({ id: i.id, patch: clearHoldup(i, company) })));
          },
        },
      });
      return true;
    },
    [companies, data, feedback, items],
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
              // Say what it frees up; otherwise a way back from a tap that was a mistake.
              if (!ok || release(item, () => void apply(item, reopen))) return;
              feedback.toast({ message: `Completed ${item.title}`, action: { label: 'Undo', onPress: () => void apply(item, reopen) } });
            })
            .finally(() => setChecking((s) => new Set([...s].filter((id) => id !== item.id))));
        }, CHECK_DELAY),
      );
    },
    [apply, feedback, me, release],
  );

  const onReady = useCallback(
    (item: Item) => {
      haptic.tap();
      const next = tidyItem({ ...fieldsOf(item), ready: true });
      void data.updateItem(item.id, { ready: next.ready, waitingOn: next.waitingOn, waitingOnItems: next.waitingOnItems, readyBy: next.readyBy });
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
