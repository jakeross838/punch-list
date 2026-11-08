// What a phone is told when a company or the owner answers on their page: one line in the words
// Activity uses for the same thing ("Mike at Gator Plumbing marked Install vanity faucets done."),
// under the job's name. The company-page function sends it to the job's team through Expo's push
// service; tapping it opens the item, or the job.

/** Something done on a company's or the owner's page, worth telling the job's team. */
export type PageNews =
  | { kind: 'done' | 'confirmed'; company: string; name: string | null; item: string }
  | { kind: 'comment'; company: string; name: string | null; item: string | null; body: string }
  | { kind: 'owner_added'; name: string | null; words: string }
  | { kind: 'owner_signed_off'; name: string | null; location: string | null };

/** At most this long: about what a lock screen shows. */
export const NEWS_MOST = 180;

const oneLine = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
const cut = (text: string, most: number) => (text.length > most ? `${text.slice(0, most - 1).trimEnd()}…` : text);
const ended = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/** Who did it, as Activity says it: "Mike at Gator Plumbing", or the company alone. */
function companyWho(company: string, name: string | null): string {
  const c = cut(oneLine(company), 60) || 'The company';
  const n = cut(oneLine(name), 40);
  return n ? `${n} at ${c}` : c;
}

/** The owner, as Activity says it: "Karen, the owner," or "The owner". */
const ownerWho = (name: string | null) => {
  const n = cut(oneLine(name), 40);
  return n ? `${n}, the owner,` : 'The owner';
};

const titled = (item: string | null) => cut(oneLine(item), 60) || 'an item';

/** The line a phone shows for something done on a company's or the owner's page. */
export function newsLine(news: PageNews): string {
  switch (news.kind) {
    case 'done':
      return cut(`${companyWho(news.company, news.name)} marked ${titled(news.item)} done.`, NEWS_MOST);
    case 'confirmed':
      return cut(`${companyWho(news.company, news.name)} confirmed ${titled(news.item)}.`, NEWS_MOST);
    case 'comment': {
      const on = news.item === null ? `the ${cut(oneLine(news.company), 60) || 'company'} list` : titled(news.item);
      const said = oneLine(news.body);
      return cut(ended(`${companyWho(news.company, news.name)} commented on ${on}${said ? `: ${said}` : ''}`), NEWS_MOST);
    }
    case 'owner_added': {
      const said = oneLine(news.words);
      return cut(ended(said ? `${ownerWho(news.name)} added something to look at: ${said}` : `${ownerWho(news.name)} added a photo of something to look at`), NEWS_MOST);
    }
    case 'owner_signed_off': {
      const where = cut(oneLine(news.location), 60);
      return cut(`${ownerWho(news.name)} signed off ${where || 'the job'}.`, NEWS_MOST);
    }
  }
}
