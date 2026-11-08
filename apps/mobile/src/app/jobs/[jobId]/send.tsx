// Send Lists: every company with open work on the job, how much of it is ready now, and what is new
// since its last list. Each company's list goes to its people: by email, or by text to anyone with
// only a phone. Tap one to look it over as a PDF; the send button writes the email or text, and
// Send All goes through every company in one pass. Each list sent is recorded (with Undo), so the
// next one marks what is new. The owner and the design team get what the work waits on from them;
// the whole job, location by location, is for your own team. Make a List makes any other list: it
// starts from what the job shows now, takes every filter, and lays the page out as picked. A
// company's list prints each item's comments and the comments on its whole list, the Whole Job
// prints each item's comments, and so can a list made to order. The owner's and the design team's
// lists leave them off: they are between you and the company. Internal notes never print. Nothing
// is sent from the preview page: it shows the email or text as it would be written, and Mark Sent
// records it.

import {
  itemsCsv,
  itemsSheet,
  sheetFileName,
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
  lastSend,
  LIST_KEYS,
  listComments,
  listRecipients,
  listTitle,
  newSince,
  partiesWaitedOn,
  partyList,
  partyPrintout,
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
  type ViewSettings,
} from '@punch/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ExportSheet, type ListDraft } from '@/components/ExportSheet';
import { SpreadsheetSheet } from '@/components/SpreadsheetSheet';
import { useFilterNames } from '@/components/FilterBar';
import { MessagePreview, namesText, type Message } from '@/components/MessagePreview';
import { NudgeSection } from '@/components/NudgeSection';
import { colors, layout } from '@/constants/theme';
import { useData } from '@/data/api';
import { pageUrlFor } from '@/data/links';
import { scanCode } from '@/export/scanCode';
import * as WebBrowser from 'expo-web-browser';
import { useFilterContext, useJobView } from '@/data/view';
import { composeEmail, composeText, copyText } from '@/export/compose';
import { DocPreview } from '@/export/DocPreview';
import { makePdf, printFonts, printPhoto, sharePdf, showPdf } from '@/export/printing';
import { shareSpreadsheet } from '@/export/spreadsheet';
import { Button, EmptyState, haptic, Icon, ListRow, ListSection, ListSwitchRow, Page, shortDate, Sheet, Text, Touchable, useFeedback, type IconName } from '@/ui';

const ON_THE_PHONE = Platform.OS !== 'web';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One list that can go out. */
interface Target {
  /** The list key: "job", "company:<id>", "party:<name>"; "custom" for one made to order. */
  list: string;
  name: string;
  kind: 'company' | 'party' | 'job' | 'custom';
  companyId?: string;
}

/** How the job is grouped on screen, as a list made to order groups it. */
const LIST_GROUP: Record<GroupBy, ListGroupBy> = { room: 'location', company: 'company', waiting: 'waiting' };

/** A new list to make: the job's filters and grouping to start from. */
function listOf(view: ViewSettings): ListDraft {
  return { filters: view.filters, completed: view.showCompleted, design: { ...DEFAULT_LIST_DESIGN, groupBy: LIST_GROUP[view.groupBy] } };
}

/** A printed page, with the footer for every page of its PDF. */
interface Doc {
  printout: Printout;
  footer: string;
}

interface Made {
  target: Target;
  doc: Doc;
  itemIds: string[];
  /** Who it goes to and what it says; none for the lists that go from the share sheet. */
  message?: Message;
}

export default function SendScreen() {
  // start: opened from the job's Make a List, so the list to make shows straight away.
  const { jobId, start } = useLocalSearchParams<{ jobId: string; start?: string }>();
  const data = useData();
  const feedback = useFeedback();
  const job = data.useJobs().find((j) => j.id === jobId);
  const items = data.useItems(jobId);
  const photos = data.usePhotos(jobId);
  const sends = data.useSends(jobId);
  const locations = data.useLocations(jobId);
  const companies = data.useCompanies();
  const people = data.usePeople();
  const me = data.useMe();
  // Whose lists they are, at the top of every page and to sign the emails.
  const builder = data.useOrg().name;
  const contacts = data.useContacts();
  const comments = data.useComments(jobId);
  const links = data.useCompanyLinks(jobId);
  const [withPhotos, setWithPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ made: Made; fontCss: string } | null>(null);
  const [view] = useJobView(jobId, data.useViewSettings());
  const context = useFilterContext(jobId);
  const names = useFilterNames(jobId);
  const [draft, setDraft] = useState<ListDraft | null>(() => (start === 'list' ? listOf(view) : null));
  const [spreadsheet, setSpreadsheet] = useState<{ csv: string; fileName: string; rows: string[][] } | null>(null);

  const today = dayOfDate(new Date());
  // With the items, every list says which tasks an item waits on.
  const trades = data.useTrades();
  const lookups = useMemo(() => ({ locations, companies, people, items, trades }), [locations, companies, people, items, trades]);
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
  async function shareSheet(csv: string, fileName: string) {
    try {
      haptic.tap();
      await shareSpreadsheet(csv, fileName, `${job?.name ?? 'Job'} items`);
    } catch {
      feedback.toast({ message: 'The spreadsheet did not open. Try again.' });
    }
  }
  async function exportSheet() {
    const look = {
      locations: new Map(locations.map((l) => [l.id, { label: l.label, floor: l.floor }])),
      companies: new Map(companies.map((c) => [c.id, c.name])),
      people: new Map(people.map((p) => [p.id, p.name])),
      items: new Map(items.map((i) => [i.id, i])),
    };
    const csv = itemsCsv(items, look);
    const fileName = sheetFileName(job?.name ?? 'Job', today);
    // The preview page shows it first: not every page that shows the preview can download.
    if (!ON_THE_PHONE) {
      haptic.tap();
      setSpreadsheet({ csv, fileName, rows: itemsSheet(items, look) });
      return;
    }
    await shareSheet(csv, fileName);
  }
  /** Make a List starts from what the job shows now. */
  const startList = () => {
    haptic.tap();
    setDraft(listOf(view));
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

  /** How a company's list reaches it, as the row says it. */
  function reach(companyId: string): { line: string; icon: IconName } {
    const r = listRecipients(contacts, companyId);
    if (r.emails.length > 0) return { line: `To ${namesText(r.people.filter((p) => p.email).map((p) => p.name || p.email!))}`, icon: 'envelope' };
    if (r.phones.length > 0) return { line: `By text to ${namesText(r.people.filter((p) => p.phone).map((p) => p.name || p.phone!))}`, icon: 'message' };
    return { line: 'No one to send to yet', icon: 'share' };
  }

  /** "Sent October 23, 2 new", or "Sent October 23". */
  function sentLine(target: Target): string {
    const last = lastSend(sends, target.list);
    if (!last) return 'Not sent yet';
    const fresh = newSince(
      linesOf(target).map((l) => l.item.id),
      last,
    ).size;
    const day = shortDate(last.sentAt.slice(0, 10)).replace(' ', '\u00a0');
    return fresh > 0 ? `Sent ${day}, ${fresh}\u00a0new` : `Sent ${day}`;
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
    const lines = linesOf(target);
    const itemIds = lines.map((l) => l.item.id);
    const fresh = newSince(itemIds, lastSend(sends, target.list));
    const prepared = withPhotos ? await printPhotos(itemIds) : null;
    const settings: PrintSettings = {
      job: jobOf(),
      builder,
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      isNew: target.kind === 'job' ? undefined : (id) => fresh.has(id),
      comments: target.kind === 'party' ? undefined : printedOn,
      listComments: target.kind === 'company' && target.companyId ? printed(listComments(comments, target.companyId, { shared: true })) : undefined,
    };
    if (target.kind === 'company' && target.companyId) {
      const list = companyList(target.companyId, items, lookups);
      // A company's list carries its page: the link, and the code to scan for it. Without a signal
      // on the preview or a first link not made yet, the list still goes, without them.
      const url = await data
        .companyLink(jobId, target.companyId)
        .then((token) => pageUrlFor(data.mode, token))
        .catch(() => null);
      settings.link = url ? { url, code: scanCode(url) } : undefined;
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
              ...companyListEmail({ job: jobOf(), contacts: r.people.filter((p) => p.email), from: me, company: builder, ready, link: url }),
            }
          : r.phones.length > 0
            ? { by: 'text', phones: r.phones, names: r.people.filter((p) => p.phone).map((p) => p.name || p.phone!), body: companyListText({ job: jobOf(), contacts: r.people, from: me, company: builder, link: url }) }
            : { by: 'none', company: target.name };
      return { target, doc: { printout, footer: footerText(printout, settings) }, itemIds, message };
    }
    const printout = target.kind === 'party' ? partyPrintout(target.name, lines, settings) : jobPrintout(lines, settings);
    return { target, doc: { printout, footer: footerText(printout, settings) }, itemIds };
  }

  /** The list made to order, as a page: the filters it was made with said under the title. */
  async function makeCustom(list: ListDraft): Promise<Made> {
    const itemIds = customLines.map((l) => l.item.id);
    const prepared = list.design.details.includes('photo') ? await printPhotos(itemIds) : null;
    const settings: CustomPrintSettings = {
      job: jobOf(),
      builder,
      date: new Date(),
      photo: prepared ? (id) => prepared.get(id) : undefined,
      comments: printedOn,
      filters: filterChips(list.filters, names).map((c) => c.label),
    };
    const printout = customPrintout(customLines, { ...list.design, title: customTitle }, settings);
    return { target: { list: 'custom', name: customTitle, kind: 'custom' }, doc: { printout, footer: footerText(printout, settings) }, itemIds };
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
      const file = await makePdf(made.doc.printout, made.doc.footer);
      if (send) await sharePdf(file, made.doc.printout.title);
      else await showPdf(file, made.doc.printout.title);
    } catch {
      haptic.warning();
      feedback.toast({ message: 'That list did not come out. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  /** Keeps a record that the list went out, with Undo for a share that was cancelled. */
  async function record(made: Made, quiet = false): Promise<string> {
    const id = await data.recordSend({ jobId, list: made.target.list, itemIds: made.itemIds, snapshot: null });
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
   * On the iPhone: the PDF, then Mail with the email written, or Messages with the text. Without
   * Apple Mail (the Outlook app, say), the addresses are copied and the share sheet opens with the
   * PDF, to pick the app and paste them in. False when cancelled.
   */
  async function deliver(made: Made): Promise<boolean> {
    const file = await makePdf(made.doc.printout, made.doc.footer);
    const files = [file];
    const m = made.message;
    if (m?.by === 'email' && m.to.length + m.cc.length + m.bcc.length > 0) {
      const went = await composeEmail({ to: m.to, cc: m.cc, bcc: m.bcc, subject: m.subject, body: m.body, files });
      if (went === 'cancelled') return false;
      if (went !== 'unavailable') return true;
      const copied = await copyText([...m.to, ...m.cc, ...m.bcc].join(', '));
      const ask = copied ? 'The addresses are copied. Pick your email app, then paste them in To.' : 'Pick your email app to send it.';
      if (!(await goOn('Mail is not set up on this phone', ask))) return false;
    } else if (m?.by === 'text') {
      const went = await composeText({ phones: m.phones, body: m.body, files });
      if (went === 'cancelled') return false;
      if (went !== 'unavailable') return true;
      const copied = await copyText(m.phones.join(', '));
      if (!(await goOn('Texting is not set up on this phone', copied ? 'The numbers are copied. Pick the app to send it with.' : 'Pick the app to send it with.'))) return false;
    }
    await sharePdf(file, made.doc.printout.title);
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
        await showPdf(await makePdf(made.doc.printout, made.doc.footer), made.doc.printout.title);
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

  /** What a company's page row says: whether it has a link yet. */
  const linkLine = (companyId: string) =>
    links.some((l) => l.companyId === companyId && !l.revoked) ? 'Tap to copy or open the link to their page.' : 'Their link is made with their first list, or tap to make it now.';

  /** A company's page: copy the link, open it, or make a new one (the old one stops working). */
  function pageActions(companyId: string, name: string) {
    const link = async () => pageUrlFor(data.mode, await data.companyLink(jobId, companyId));
    feedback.actionSheet({
      title: `${name}'s Page`,
      message: 'Anyone with the link sees their list here, so it goes only to their people.',
      actions: [
        {
          label: 'Copy the Link',
          onPress: () =>
            void link()
              .then(copyText)
              .then((ok) => feedback.toast({ message: ok ? 'Link copied' : 'The link did not copy. Try again.' }))
              .catch(() => feedback.toast({ message: 'The link was not made. Check the signal and try again.' })),
        },
        {
          // Their link by text, to everyone there with a phone: the quickest way onto a job site.
          label: 'Text the Link',
          onPress: () =>
            void link()
              .then(async (url) => {
                const people = listRecipients(contacts, companyId).people.filter((p) => p.phone);
                const went = await composeText({
                  phones: people.map((p) => p.phone!),
                  body: companyListText({ job: jobOf(), contacts: people, from: me, company: builder, link: url }),
                  files: [],
                });
                if (went === 'unavailable') feedback.toast({ message: 'This phone cannot text. Copy the link instead.' });
                else if (went === 'sent') haptic.success();
              })
              .catch(() => feedback.toast({ message: 'The link was not made. Check the signal and try again.' })),
        },
        {
          label: 'Open Their Page',
          onPress: () =>
            void link()
              .then((url) => WebBrowser.openBrowserAsync(url))
              .catch(() => feedback.toast({ message: 'The page did not open. Check the signal and try again.' })),
        },
        {
          label: 'Make a New Link',
          destructive: true,
          onPress: () => {
            const live = links.find((l) => l.companyId === companyId && !l.revoked);
            void (live ? data.revokeCompanyLink(live.token) : Promise.resolve())
              .then(() => data.companyLink(jobId, companyId))
              .then(() => feedback.toast({ message: 'New link made. The old one no longer works.' }))
              .catch(() => feedback.toast({ message: 'The new link was not made. Try again.' }));
          },
        },
      ],
    });
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
      jobSwitch={{ jobId, onChange: (next) => router.setParams({ jobId: next }) }}
      account
      tab={{ active: 'send', jobId }}
    >
      <ListSection footer="A list with any filters, or a spreadsheet of every item.">
        <ListRow
          title="Make a List"
          icon="doc"
          accessory="chevron"
          onPress={startList}
          right={busy === 'custom' ? <ActivityIndicator color={colors.secondary} /> : undefined}
          testID="make-list"
        />
        <ListRow title="Export to a Spreadsheet" icon="table" accessory="chevron" onPress={() => void exportSheet()} testID="export-spreadsheet" />
      </ListSection>
      {rows.length === 0 && parties.length === 0 ? (
        <EmptyState icon="checkmark.circle.fill" title="Nothing to Send" message="Every item on this job is complete." />
      ) : (
        <>
          <ListSection header="Companies" footer="Tap a company to see its list and send it.">
            {rows.map((r) => {
              const target = companyTarget(r);
              const counts = [
                plural(r.open, 'item'),
                r.ready > 0 ? `${r.ready} ready` : '',
                r.needsPrice > 0 ? `${r.needsPrice} to be quoted` : '',
              ].filter(Boolean);
              const how = reach(r.companyId);
              return (
                <ListRow
                  key={r.companyId}
                  title={r.name}
                  subtitle={`${[...counts, sentLine(target)].join(' · ')}\n${how.line}`}
                  accessory={ON_THE_PHONE ? 'none' : 'chevron'}
                  onPress={() => void openList(target)}
                  right={trailing(target, how.icon)}
                  testID={`send-${r.companyId}`}
                />
              );
            })}
          </ListSection>
          <ListSection
            header="Company Pages"
            footer="Each company's live list, where they confirm, mark done and comment. The link is on every list they get."
          >
            {rows.map((r) => (
              <ListRow
                key={`page-${r.companyId}`}
                title={r.name}
                subtitle={linkLine(r.companyId)}
                icon="link"
                accessory="chevron"
                onPress={() => pageActions(r.companyId, r.name)}
                testID={`page-${r.companyId}`}
              />
            ))}
          </ListSection>
          {ON_THE_PHONE && rows.length > 1 ? (
            <View style={styles.all}>
              <Button label={busy === 'all' ? 'Sending' : `Send All (${rows.length})`} icon="share" variant="tinted" onPress={() => void sendAll()} disabled={!!busy} testID="send-all" />
              <Text variant="footnote" color={colors.secondary} align="center" style={styles.allNote}>
                Writes each company&apos;s email or text in turn. Cancel one to skip it.
              </Text>
            </View>
          ) : null}

          <NudgeSection jobId={jobId} companies={rows} onPhone={ON_THE_PHONE} />

          {parties.length > 0 ? (
            <ListSection header="Owner, Design Team and Others" footer="What the work is waiting on from them.">
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

          <ListSection header={builder || 'Your Team'} footer="Every open item by location, with the company on every line.">
            <ListRow
              title="Whole Job"
              subtitle={`${plural(open.length, 'item')} in ${plural(rooms, 'location')} · ${open.filter((i) => i.ready).length} ready`}
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
        matching={{ items: customLines.length }}
      />

      {ON_THE_PHONE ? null : (
        <SpreadsheetSheet
          visible={!!spreadsheet}
          fileName={spreadsheet?.fileName ?? ''}
          rows={spreadsheet?.rows ?? []}
          onDownload={() => spreadsheet && void shareSheet(spreadsheet.csv, spreadsheet.fileName)}
          onClose={() => setSpreadsheet(null)}
        />
      )}

      {ON_THE_PHONE ? null : (
        <Sheet
          visible={!!preview}
          onClose={() => setPreview(null)}
          title={preview ? preview.made.doc.printout.title : ''}
          right={{ label: 'Done', variant: 'prominent', onPress: () => setPreview(null), testID: 'preview-done' }}
          testID="list-preview"
        >
          <ScrollView style={{ flex: 1 }}>
            {preview?.made.message ? (
              <MessagePreview
                message={preview.made.message}
                attachments={[preview.made.doc.printout.fileName]}
                onAddPeople={preview.made.target.companyId ? () => addPeople(preview.made.target.companyId!) : undefined}
              />
            ) : null}
            {preview ? <DocPreview printout={preview.made.doc.printout} fontCss={preview.fontCss} /> : null}
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
});
