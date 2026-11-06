// Send Lists: every company with open work on the job, how much of it is ready now, and what is new
// since its last list. Each company's list goes to its people: by email, with the link to its own
// page and the scan code on the list, or by text to anyone with only a phone. Tap one to look it
// over as a PDF; the send button writes the email or text, and Send All goes through every company
// in one pass. The Schedule Email goes to every company at once, with the Three Week Look Ahead and
// the Whole Schedule attached: to you, a copy to the rest of the job's team, and a blind copy to the
// people at every company. It keeps the schedule as it went out, so the Schedule says what moved
// since. Each list sent is recorded (with Undo), so the next one marks what is new. The owner and
// the design team get what Ross Built needs from them; the whole job, location by location, is for
// Ross Built. Make a List makes any other list: it starts from what the job shows now, takes every
// filter, and lays the page out as picked. A company's list prints each item's comments and the
// comments on its whole list, the Whole Job prints each item's comments, and so can a list made to
// order. The owner's and the design team's lists leave them off: they are between Ross Built and
// the company. Ross Built only notes never print. Nothing is sent from the preview page: it shows
// the email or text as it would be written, and Mark Sent records it.

import {
  itemsCsv,
  sheetFileName,
  buildTimeline,
  commentAuthor,
  companiesWithWork,
  companyList,
  companyListEmail,
  companyListText,
  companyPrintout,
  customPrintout,
  dayOfDate,
  DEFAULT_LIST_DESIGN,
  filterChips,
  filteredLines,
  footerText,
  itemComments,
  jobList,
  jobPrintout,
  lastScheduleSend,
  lastSend,
  LIST_KEYS,
  listComments,
  listRecipients,
  listTitle,
  lookAheadPrintout,
  lookAheadStart,
  newSince,
  partiesWaitedOn,
  partyList,
  partyPrintout,
  printDate,
  scheduleChanges,
  scheduleEmail,
  schedulePrintout,
  scheduleRecipients,
  scheduleSnapshot,
  totalTime,
  type CustomPrintSettings,
  type GroupBy,
  type ListGroupBy,
  type ListLine,
  type Comment,
  type Photo,
  type PrintComment,
  type PrintPhoto,
  type Printout,
  type PrintSettings,
  type ScheduleSnapshot,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ExportSheet, type ListDraft } from '@/components/ExportSheet';
import { useFilterNames } from '@/components/FilterBar';
import { MessagePreview, namesText, type Message } from '@/components/MessagePreview';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { companyPageUrl } from '@/data/links';
import { useFilterContext, useJobView } from '@/data/view';
import { composeEmail, composeText, copyText } from '@/export/compose';
import { DocPreview } from '@/export/DocPreview';
import { joinPdfs, makePdf, printFonts, printPhoto, sharePdf, showPdf } from '@/export/printing';
import { scanCode } from '@/export/scanCode';
import { shareSpreadsheet } from '@/export/spreadsheet';
import { Button, EmptyState, haptic, Icon, ListRow, ListSection, ListSwitchRow, Page, shortDate, Sheet, Text, Touchable, useFeedback, weekdayDate, type IconName } from '@/ui';

const ON_THE_PHONE = Platform.OS !== 'web';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One list that can go out. */
interface Target {
  /** The list key: "job", "company:<id>", "party:<name>", "lookahead", "schedule"; "custom" for one made to order. */
  list: string;
  name: string;
  kind: 'company' | 'party' | 'job' | 'custom' | 'lookahead' | 'schedule';
  companyId?: string;
}

const LOOK_AHEAD: Target = { list: LIST_KEYS.lookahead, name: 'Three Week Look Ahead', kind: 'lookahead' };
const SCHEDULE: Target = { list: LIST_KEYS.schedule, name: 'every company', kind: 'schedule' };

/** The company that is Ross Built itself: its crew is on the job's team already. */
const isRossBuilt = (name: string) => name.trim().toLowerCase() === 'ross built';

/** How the job is grouped on screen, as a list made to order groups it. */
const LIST_GROUP: Record<GroupBy, ListGroupBy> = { room: 'location', company: 'company', waiting: 'waiting' };

/** A printed page, with the footer for every page of its PDF. */
interface Doc {
  printout: Printout;
  footer: string;
}

interface Made {
  target: Target;
  /** In order: one list, or the look ahead then the whole schedule. */
  docs: Doc[];
  itemIds: string[];
  /** The schedule as it goes out, for the look ahead and the Schedule Email. */
  snapshot?: ScheduleSnapshot;
  /** Who it goes to and what it says; none for the lists that go from the share sheet. */
  message?: Message;
  /** Something to know before it goes: who has no email yet. */
  note?: string;
}

export default function SendScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const visits = data.useVisits(jobId);
  const sends = data.useSends(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const people = data.usePeople();
  const me = data.useMe();
  const team = data.useTeams();
  const contacts = data.useContacts();
  const comments = data.useComments(jobId);
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ made: Made; fontCss: string } | null>(null);
  const [view] = useJobView(jobId, data.useViewSettings());
  const context = useFilterContext(jobId);
  const names = useFilterNames(jobId);
  const [draft, setDraft] = useState<ListDraft | null>(null);

  const today = dayOfDate(new Date());
  // With the items and visits, every list says which tasks an item waits on and when they are scheduled.
  const trades = data.useTrades();
  const lookups = useMemo(() => ({ locations, companies, items, visits, today, trades }), [locations, companies, items, visits, today, trades]);
  const look = useMemo(
    () => ({ people: new Map(people.map((p) => [p.id, p.name])), companies: new Map(companies.map((c) => [c.id, c.name])) }),
    [people, companies],
  );
  /** A comment as it prints: who, when, what. */
  const printed = (list: Comment[]): PrintComment[] => list.map((c) => ({ who: commentAuthor(c, look), at: c.createdAt, body: c.body }));
  /** An item's comments as they print: only what the company sees. */
  const printedOn = (itemId: string) => printed(itemComments(comments, itemId, { shared: true }));
  const rows = useMemo(() => companiesWithWork(items, lookups), [items, lookups]);
  const parties = useMemo(() => partiesWaitedOn(items, lookups), [items, lookups]);
  const open = items.filter((i) => i.status === 'open' && !i.unfinished);
  const unfinished = items.filter((i) => i.status === 'open' && i.unfinished).length;
  const rooms = new Set(open.map((i) => i.locationId)).size;
  const firstPhoto = useMemo(() => {
    const map = new Map<string, Photo>();
    for (const p of photos) if (!map.has(p.itemId)) map.set(p.itemId, p);
    return map;
  }, [photos]);

  // The list being made to order: what it holds right now.
  const customLines = useMemo(
    () => (draft ? filteredLines(items, draft.filters, lookups, { context, completed: draft.completed }) : []),
    [draft, items, lookups, context],
  );
  const customTitle = draft ? draft.design.title.trim() || listTitle(draft.filters, names) : '';
  /** Every item on the job as a spreadsheet, for Excel, Numbers or Google Sheets. */
  async function exportSheet() {
    const csv = itemsCsv(items, {
      locations: new Map(locations.map((l) => [l.id, { label: l.label, floor: l.floor }])),
      companies: new Map(companies.map((c) => [c.id, c.name])),
      people: new Map(people.map((p) => [p.id, p.name])),
      items: new Map(items.map((i) => [i.id, i])),
      visits: new Map(visits.map((v) => [v.id, v])),
    });
    try {
      haptic.tap();
      await shareSpreadsheet(csv, sheetFileName(job?.name ?? 'Job', today), `${job?.name ?? 'Job'} items`);
    } catch {
      feedback.toast({ message: 'The spreadsheet did not open. Try again.' });
    }
  }
  const customTime = totalTime(customLines.filter((l) => l.item.status === 'open').map((l) => l.item));
  /** Make a List starts from what the job shows now. */
  const startList = () => {
    haptic.tap();
    setDraft({ filters: view.filters, completed: view.showCompleted, design: { ...DEFAULT_LIST_DESIGN, groupBy: LIST_GROUP[view.groupBy] } });
  };

  /** The items on a list right now, in its order. */
  function linesOf(target: Target): ListLine[] {
    if (target.kind === 'company' && target.companyId) {
      const list = companyList(target.companyId, items, lookups);
      return [...list.ready, ...list.waiting.flatMap((g) => g.lines), ...list.needsPrice];
    }
    if (target.kind === 'party') return partyList(target.name, items, lookups);
    return jobList(items, lookups);
  }

  // The schedule now, and what moved since it last went out.
  const timeline = useMemo(() => buildTimeline(items, visits, locations, today), [items, visits, locations, today]);
  const lastSchedule = lastScheduleSend(sends);
  const hasOpenWork = (companyId: string) => items.some((i) => i.companyId === companyId && i.status === 'open' && !i.unfinished);
  const changes = lastSchedule?.snapshot ? scheduleChanges(lastSchedule.snapshot, scheduleSnapshot(timeline), lastSchedule.sentAt, hasOpenWork) : null;

  /** How a company's list reaches it, as the row says it. */
  function reach(companyId: string): { line: string; icon: IconName } {
    const r = listRecipients(contacts, companyId);
    if (r.emails.length > 0) return { line: `To ${namesText(r.people.filter((p) => p.email).map((p) => p.name || p.email!))}`, icon: 'envelope' };
    if (r.phones.length > 0) return { line: `By text to ${namesText(r.people.filter((p) => p.phone).map((p) => p.name || p.phone!))}`, icon: 'message' };
    return { line: 'Nobody gets its lists yet', icon: 'share' };
  }

  /** "Sent October 23. 2 new since then", or "Sent October 23". */
  function sentLine(target: Target): string {
    const last = lastSend(sends, target.list);
    if (!last) return 'Not sent yet';
    if (target.kind === 'lookahead' || target.kind === 'schedule') return `Sent ${shortDate(last.sentAt.slice(0, 10)).replace(' ', '\u00a0')}`;
    const fresh = newSince(
      linesOf(target).map((l) => l.item.id),
      last,
    ).size;
    const day = shortDate(last.sentAt.slice(0, 10)).replace(' ', '\u00a0');
    return fresh > 0 ? `Sent ${day}. ${fresh}\u00a0new since then` : `Sent ${day}`;
  }

  /** Each item's first photo at print size, a few at a time to keep the phone's memory steady. */
  async function printPhotos(itemIds: string[]): Promise<Map<string, PrintPhoto>> {
    const out = new Map<string, PrintPhoto>();
    const wanted = itemIds.map((id) => firstPhoto.get(id)).filter((p): p is Photo => !!p);
    for (let i = 0; i < wanted.length; i += 4) {
      await Promise.all(
        wanted.slice(i, i + 4).map(async (p) => {
          try {
            out.set(p.itemId, { src: await printPhoto(p.uri), width: p.width, height: p.height, marks: p.marks });
          } catch {
            // That photo is left off the list; the item still prints.
          }
        }),
      );
    }
    return out;
  }

  const jobOf = () => ({ name: job?.name ?? 'Job', address: job?.address ?? '' });

  async function make(target: Target): Promise<Made> {
    if (target.kind === 'lookahead' || target.kind === 'schedule') {
      const settings = { job: jobOf(), date: new Date() };
      const ahead = lookAheadPrintout(timeline, lookups, settings, today);
      const docs: Doc[] = [{ printout: ahead, footer: footerText(ahead, settings) }];
      const snapshot = scheduleSnapshot(timeline);
      if (target.kind === 'lookahead') {
        const from = lookAheadStart(today);
        const itemIds = timeline.bars.filter((b) => b.end >= from).flatMap((b) => b.items.map((i) => i.id));
        return { target, docs, itemIds, snapshot };
      }
      const whole = schedulePrintout(timeline, lookups, settings, today, { changes });
      docs.push({ printout: whole, footer: footerText(whole, settings) });
      const companyIds = rows.map((r) => r.companyId);
      const to = scheduleRecipients({ me, jobId, team, people, companyIds, contacts });
      const mail = scheduleEmail({ job: jobOf(), from: me });
      const without = to.without.map((id) => companies.find((c) => c.id === id)?.name ?? '').filter((n) => n && !isRossBuilt(n));
      return {
        target,
        docs,
        itemIds: timeline.bars.flatMap((b) => b.items.map((i) => i.id)),
        snapshot,
        message: { by: 'email', to: to.to, cc: to.cc, bcc: to.bcc, subject: mail.subject, body: mail.body, names: [] },
        note: without.length > 0 ? `No email yet for ${namesText(without)}: add their people to send it to them too.` : undefined,
      };
    }
    const lines = linesOf(target);
    const itemIds = lines.map((l) => l.item.id);
    const fresh = newSince(itemIds, lastSend(sends, target.list));
    const prepared = withPhotos ? await printPhotos(itemIds) : null;
    // A company's list carries its page: the link, and the scan code for it.
    const url = target.kind === 'company' && target.companyId ? companyPageUrl(await data.companyLink(jobId, target.companyId)) : null;
    const settings: PrintSettings = {
      job: jobOf(),
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      isNew: target.kind === 'job' ? undefined : (id) => fresh.has(id),
      visits: target.kind === 'company' ? visits.filter((v) => v.companyId === target.companyId) : undefined,
      comments: target.kind === 'party' ? undefined : printedOn,
      listComments: target.kind === 'company' && target.companyId ? printed(listComments(comments, target.companyId, { shared: true })) : undefined,
      link: url ? { url, code: scanCode(url) } : undefined,
    };
    if (target.kind === 'company' && target.companyId) {
      const list = companyList(target.companyId, items, lookups);
      const printout = companyPrintout(list, settings);
      const r = listRecipients(contacts, target.companyId);
      const ready = list.ready.length;
      const message: Message =
        r.emails.length > 0
          ? {
              by: 'email',
              to: r.emails,
              cc: [],
              bcc: [],
              names: r.people.filter((p) => p.email).map((p) => p.name),
              ...companyListEmail({ job: jobOf(), contacts: r.people.filter((p) => p.email), link: url, from: me, ready }),
            }
          : r.phones.length > 0
            ? { by: 'text', phones: r.phones, names: r.people.filter((p) => p.phone).map((p) => p.name || p.phone!), body: companyListText({ job: jobOf(), contacts: r.people, link: url, from: me }) }
            : { by: 'none', company: target.name };
      return { target, docs: [{ printout, footer: footerText(printout, settings) }], itemIds, message };
    }
    const printout = target.kind === 'party' ? partyPrintout(target.name, lines, settings) : jobPrintout(lines, settings);
    return { target, docs: [{ printout, footer: footerText(printout, settings) }], itemIds };
  }

  /** The list made to order, as a page: the filters it was made with said under the title. */
  async function makeCustom(list: ListDraft): Promise<Made> {
    const itemIds = customLines.map((l) => l.item.id);
    const prepared = list.design.details.includes('photo') ? await printPhotos(itemIds) : null;
    const settings: CustomPrintSettings = {
      job: { name: job?.name ?? 'Job', address: job?.address ?? '' },
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      comments: printedOn,
      filters: filterChips(list.filters, names).map((c) => c.label),
    };
    const printout = customPrintout(customLines, { ...list.design, title: customTitle }, settings);
    return { target: { list: 'custom', name: customTitle, kind: 'custom' }, docs: [{ printout, footer: footerText(printout, settings) }], itemIds };
  }

  async function openCustom(send = false) {
    if (!draft || busy) return;
    haptic.tap();
    setBusy('custom');
    try {
      const made = await makeCustom(draft);
      if (!ON_THE_PHONE) {
        setPreview({ made, fontCss: await printFonts() });
        return;
      }
      const doc = made.docs[0]!;
      const file = await makePdf(doc.printout, doc.footer);
      if (send) await sharePdf(file, doc.printout.title);
      else await showPdf(file, doc.printout.title);
    } catch {
      haptic.warning();
      feedback.toast({ message: 'That list did not come out. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  /** Keeps a record that the list went out, with Undo for a share that was cancelled. */
  async function record(made: Made, quiet = false): Promise<string> {
    const id = await data.recordSend({ jobId, list: made.target.list, itemIds: made.itemIds, snapshot: made.snapshot ?? null });
    if (!quiet) {
      feedback.toast({ message: `Marked as sent to ${made.target.name}`, action: { label: 'Undo', onPress: () => void data.undoSend(id) } });
    }
    return id;
  }

  /** Asks before the share sheet, when the email or text cannot be written here. True to go on. */
  const goOn = (title: string, message: string) =>
    new Promise<boolean>((resolve) =>
      // The sheet slides away before the share sheet comes up.
      feedback.actionSheet({ title, message, actions: [{ label: 'Choose the App', onPress: () => setTimeout(() => resolve(true), 350) }], onCancel: () => resolve(false) }),
    );

  /**
   * On the iPhone: the PDFs, then Mail with the email written, or Messages with the text. Without
   * Apple Mail (the Outlook app, say), the addresses are copied and the share sheet opens with the
   * PDFs as one, to pick the app and paste them in. False when cancelled.
   */
  async function deliver(made: Made): Promise<boolean> {
    const files = [];
    for (const d of made.docs) files.push(await makePdf(d.printout, d.footer));
    const m = made.message;
    if (m?.by === 'email' && m.to.length + m.cc.length + m.bcc.length > 0) {
      const went = await composeEmail({ to: m.to, cc: m.cc, bcc: m.bcc, subject: m.subject, body: m.body, files });
      if (went === 'cancelled') return false;
      if (went !== 'unavailable') return true;
      const copied = await copyText([...m.to, ...m.cc, ...m.bcc].join(', '));
      const where = m.bcc.length > 0 ? 'Bcc, so nobody sees the others' : 'To';
      const ask = copied ? `The addresses are copied. Pick your email app, then paste them in ${where}.` : 'Pick your email app to send it.';
      if (!(await goOn('Mail is not set up on this phone', ask))) return false;
    } else if (m?.by === 'text') {
      const went = await composeText({ phones: m.phones, body: m.body, files });
      if (went === 'cancelled') return false;
      if (went !== 'unavailable') return true;
      const copied = await copyText(m.phones.join(', '));
      if (!(await goOn('Texting is not set up on this phone', copied ? 'The numbers are copied. Pick the app to send it with.' : 'Pick the app to send it with.'))) return false;
    }
    const title = made.docs[0]!.printout.title;
    const one = files.length > 1 ? await joinPdfs(files, `${job?.name ?? 'Job'} Construction Schedule, ${printDate(new Date()).replace(',', '')}.pdf`) : files[0]!;
    await sharePdf(one, title);
    return true;
  }

  async function openList(target: Target, send = false) {
    if (busy) return;
    haptic.tap();
    setBusy(target.list);
    try {
      const made = await make(target);
      if (!ON_THE_PHONE) {
        setPreview({ made, fontCss: await printFonts() });
        return;
      }
      if (send) {
        if (await deliver(made)) await record(made);
      } else {
        const doc = made.docs[0]!;
        await showPdf(await makePdf(doc.printout, doc.footer), doc.printout.title);
      }
    } catch {
      haptic.warning();
      feedback.toast({ message: 'That list did not come out. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  /** Friday in one pass: each company's list to its people, one after another. Cancel one to skip it. */
  async function sendAll() {
    if (busy) return;
    setBusy('all');
    const sent: string[] = [];
    try {
      for (const r of rows) {
        const made = await make({ list: LIST_KEYS.company(r.companyId), name: r.name, kind: 'company', companyId: r.companyId });
        if (await deliver(made)) sent.push(await record(made, true));
      }
      haptic.success();
    } catch {
      haptic.warning();
    } finally {
      setBusy(null);
      if (sent.length > 0) {
        feedback.toast({
          message: `Marked ${plural(sent.length, 'list')} as sent`,
          action: { label: 'Undo', onPress: () => sent.forEach((id) => void data.undoSend(id)) },
        });
      }
    }
  }

  const trailing = (target: Target, icon: IconName = 'share') =>
    busy === target.list ? (
      <ActivityIndicator color={colors.secondary} />
    ) : ON_THE_PHONE ? (
      <Touchable
        feedback="opacity"
        hitSlop={8}
        onPress={() => void openList(target, true)}
        accessibilityRole="button"
        accessibilityLabel={`Send to ${target.name}`}
        style={styles.share}
      >
        <Icon name={icon} size={20} color={colors.tint} />
      </Touchable>
    ) : undefined;

  // The Schedule Email: who it reaches, when it last went, and what moved since.
  const reached = rows.filter((r) => listRecipients(contacts, r.companyId).emails.length > 0).length;
  const moved = changes ? changes.changes.length : 0;
  const scheduleLine = [
    `${sentLine(SCHEDULE)}.`,
    lastSchedule && moved > 0 ? `${plural(moved, 'company', 'companies')} changed since ${weekdayDate(dayOfDate(new Date(lastSchedule.sentAt)))}.` : '',
    `To ${plural(reached, 'company', 'companies')}.`,
  ]
    .filter(Boolean)
    .join(' ');
  const addPeople = (companyId: string) => {
    setPreview(null);
    router.push({ pathname: '/settings/companies/[companyId]', params: { companyId } });
  };

  const companyTarget = (r: { companyId: string; name: string }): Target => ({ list: LIST_KEYS.company(r.companyId), name: r.name, kind: 'company', companyId: r.companyId });
  const partyTarget = (party: string): Target => ({ list: LIST_KEYS.party(party), name: party, kind: 'party' });
  const jobTarget: Target = { list: LIST_KEYS.job, name: 'Whole Job', kind: 'job' };

  return (
    <Page
      title="Send Lists"
      eyebrow={job ? `${job.name} · lists and the schedule` : 'Lists and the schedule'}
      crumb={[job?.name ?? 'Job', 'Send']}
      jobSwitch={{ jobId, onChange: (next) => router.setParams({ jobId: next }) }}
      account
      tab={{ active: 'send', jobId }}
    >
      <ListSection
        header="For Everyone"
        footer="The schedule the list builds. The Schedule Email sends the Three Week Look Ahead and the Whole Schedule to every company at once, to confirm their dates. Green is confirmed; blue is our best guess."
      >
        <ListRow
          title="Schedule Email"
          subtitle={scheduleLine}
          icon="envelope"
          accessory="chevron"
          onPress={() => void openList(SCHEDULE, ON_THE_PHONE)}
          right={busy === SCHEDULE.list ? <ActivityIndicator color={colors.secondary} /> : undefined}
          testID="send-schedule"
        />
        <ListRow
          title="Three Week Look Ahead"
          subtitle={`${sentLine(LOOK_AHEAD)}.`}
          icon="calendar"
          accessory={ON_THE_PHONE ? 'none' : 'chevron'}
          onPress={() => void openList(LOOK_AHEAD)}
          right={trailing(LOOK_AHEAD)}
          testID="send-lookahead"
        />
      </ListSection>
      <ListSection footer="Make a List takes any filters, grouped your way, with the details you pick on every line. The spreadsheet has every item on the job, for Excel, Numbers or Google Sheets.">
        <ListRow
          title="Make a List"
          icon="doc"
          accessory="chevron"
          onPress={startList}
          right={busy === 'custom' ? <ActivityIndicator color={colors.secondary} /> : undefined}
          testID="make-list"
        />
        <ListRow title="Export to a Spreadsheet" icon="table" accessory="chevron" onPress={() => void exportSheet()} testID="export-sheet" />
      </ListSection>
      {rows.length === 0 && parties.length === 0 ? (
        <EmptyState icon="checkmark.circle.fill" title="Nothing to Send" message="Every item on this job is complete." />
      ) : (
        <>
          <ListSection header="Companies" footer="Tap a company to see its list. Each list goes to the company's people, with the link to its own page.">
            {rows.map((r) => {
              const target = companyTarget(r);
              const counts = [
                plural(r.open, 'item'),
                r.ready > 0 ? `${r.ready} ready now` : '',
                r.needsPrice > 0 ? `${r.needsPrice} to be quoted` : '',
              ].filter(Boolean);
              const how = reach(r.companyId);
              return (
                <ListRow
                  key={r.companyId}
                  title={r.name}
                  subtitle={`${counts.join(', ')}. ${sentLine(target)}. ${how.line}.`}
                  accessory={ON_THE_PHONE ? 'none' : 'chevron'}
                  onPress={() => void openList(target)}
                  right={trailing(target, how.icon)}
                  testID={`send-${r.companyId}`}
                />
              );
            })}
          </ListSection>
          {ON_THE_PHONE && rows.length > 1 ? (
            <View style={styles.all}>
              <Button label={busy === 'all' ? 'Sending' : `Send All (${rows.length})`} icon="share" variant="tinted" onPress={() => void sendAll()} disabled={!!busy} testID="send-all" />
              <Text variant="footnote" color={colors.secondary} align="center" style={styles.allNote}>
                Writes each company&apos;s email or text in turn. Cancel one to skip it.
              </Text>
            </View>
          ) : null}

          {parties.length > 0 ? (
            <ListSection header="Owner, Design Team and Others" footer="What we need from them, and when.">
              {parties.map((p) => {
                const target = partyTarget(p.party);
                return (
                  <ListRow
                    key={p.party}
                    title={p.party}
                    subtitle={`${plural(p.lines, 'item')} waiting. ${sentLine(target)}.`}
                    accessory={ON_THE_PHONE ? 'none' : 'chevron'}
                    onPress={() => void openList(target)}
                    right={trailing(target)}
                    testID={`send-party-${p.party.toLowerCase().replace(/\s+/g, '-')}`}
                  />
                );
              })}
            </ListSection>
          ) : null}

          <ListSection header="Ross Built" footer="Every open item by location, with the company on every line.">
            <ListRow
              title="Whole Job"
              subtitle={`${plural(open.length, 'item')} in ${plural(rooms, 'location')}, ${open.filter((i) => i.ready).length} ready now`}
              accessory={ON_THE_PHONE ? 'none' : 'chevron'}
              onPress={() => void openList(jobTarget)}
              right={trailing(jobTarget)}
              testID="send-job"
            />
          </ListSection>
          <ListSection
            footer={`Adds each item's first photo, with its markup, to every list.${unfinished > 0 ? ` ${plural(unfinished, 'draft')} ${unfinished === 1 ? 'is' : 'are'} not on any list yet.` : ''}`}
          >
            <ListSwitchRow title="Include Photos" value={withPhotos} onValueChange={setWithPhotos} testID="switch-photos" />
          </ListSection>
        </>
      )}

      <ExportSheet
        jobId={jobId}
        draft={draft}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onPreview={() => void openCustom()}
        onSend={() => void openCustom(true)}
        busy={busy === 'custom'}
        suggestedTitle={draft ? listTitle(draft.filters, names) : ''}
        matching={{ items: customLines.length, time: customTime }}
      />

      {ON_THE_PHONE ? null : (
        <Sheet
          visible={!!preview}
          onClose={() => setPreview(null)}
          title={preview ? (preview.made.target.kind === 'schedule' ? 'Schedule Email' : preview.made.docs[0]!.printout.title) : ''}
          right={{ label: 'Done', variant: 'prominent', onPress: () => setPreview(null), testID: 'preview-done' }}
          testID="list-preview"
        >
          <ScrollView style={{ flex: 1 }}>
            {preview?.made.message ? (
              <MessagePreview
                message={preview.made.message}
                attachments={preview.made.docs.map((d) => d.printout.fileName)}
                note={preview.made.note}
                onAddPeople={
                  preview.made.target.companyId
                    ? () => addPeople(preview.made.target.companyId!)
                    : preview.made.note
                      ? () => {
                          setPreview(null);
                          router.push('/settings/companies');
                        }
                      : undefined
                }
              />
            ) : null}
            {preview
              ? preview.made.docs.map((d) => (
                  <View key={d.printout.fileName}>
                    {preview.made.docs.length > 1 ? (
                      <Text variant="label" color={colors.secondary} style={styles.docLabel}>
                        {d.printout.title}
                      </Text>
                    ) : null}
                    <DocPreview printout={d.printout} fontCss={preview.fontCss} />
                  </View>
                ))
              : null}
            <View style={styles.note}>
              <Text variant="footnote" color={colors.secondary} align="center">
                {preview?.made.message && preview.made.message.by !== 'none'
                  ? `On the iPhone, ${preview.made.message.by === 'email' ? 'Mail' : 'Messages'} opens with this written and the PDF attached, ready to send.`
                  : 'On the iPhone this opens as a PDF with page numbers, ready to send by email or text.'}
              </Text>
              {preview && preview.made.target.kind !== 'custom' ? (
                <Touchable
                  feedback="opacity"
                  onPress={() => {
                    void record(preview.made);
                    setPreview(null);
                  }}
                  accessibilityRole="button"
                  testID="mark-sent"
                  style={styles.markSent}
                >
                  <Text color={colors.tint}>Mark Sent</Text>
                </Touchable>
              ) : null}
            </View>
          </ScrollView>
        </Sheet>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  share: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  all: { marginHorizontal: layout.margin, marginTop: -8, marginBottom: 22, gap: 8 },
  allNote: { paddingHorizontal: 16 },
  note: { paddingHorizontal: layout.inset, paddingBottom: 28, alignItems: 'center', gap: 6 },
  markSent: { height: 44, justifyContent: 'center' },
  docLabel: { marginHorizontal: 20, marginTop: 14, marginBottom: -2 },
});
