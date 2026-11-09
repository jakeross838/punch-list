// Help: the answers to the questions people ask about the app, in the app's own words, and what
// Claude is told when someone asks it how to do something (the 'how' task answers from these and
// nothing else). Kept in the core so the phone, the preview and the server all have the same help.

export interface HelpEntry {
  id: string;
  /** The heading it sits under. */
  topic: string;
  question: string;
  answer: string;
}

export const HELP_TOPICS = ['Getting Started', 'The Walk', 'Items', 'Companies', 'Lists and Pages', 'The Owner', 'Finding Things', 'Claude', 'Your Company', 'This Phone'] as const;

export const HELP: readonly HelpEntry[] = [
  {
    id: 'what-is-it',
    topic: 'Getting Started',
    question: 'What is the app for?',
    answer: "Each job's running list of everything that still needs to be done: the punch list, the completion list and anything found along the way. Walk the job with the camera, send each company its own list, and check the work off as it gets done.",
  },
  {
    id: 'new-job',
    topic: 'Getting Started',
    question: 'How do I set up a job?',
    answer: 'On Jobs, tap New Job (the plus at the top), then give it a name and an address. Add its locations in Job Setup, under Locations: type them in level by level, paste a room list, or tap Read the Plans and Claude reads them from the plans. Copy From on New Job takes another job\'s companies, team and locations.',
  },
  {
    id: 'sample-job',
    topic: 'Getting Started',
    question: 'What is the Sample Job?',
    answer: 'A whole job to try everything on, with photos, marks and comments. Add it from Jobs with Add the Sample Job, and delete it like any other job when you are done. Its companies have no email or phone, so nothing it sends goes anywhere.',
  },
  {
    id: 'walk',
    topic: 'The Walk',
    question: 'How do I walk a job?',
    answer: "Open the job and tap Capture at the bottom. Pick the location at the top of the camera and take a photo of each thing left to do; each photo is saved as an item in that location right away. Fill each one in now, or later from Drafts on the job.",
  },
  {
    id: 'markup',
    topic: 'The Walk',
    question: 'How do I mark up a photo?',
    answer: 'Tap Mark Up on the photo. Circle, Arrow, Note and Draw are up front; More has the box, a measurement, numbered spots and crop and straighten. Tap the screen to type a note there. Tap a mark to change or remove it.',
  },
  {
    id: 'say-it',
    topic: 'The Walk',
    question: 'Can I say what is left instead of typing it?',
    answer: 'Yes. Tap Say It in the job\'s menu and say what is left to do. Claude writes it down as items, puts each in its location and assigns it when you said who does it. Check them over, then add them.',
  },
  {
    id: 'no-signal',
    topic: 'This Phone',
    question: 'Does it work with no signal?',
    answer: 'Yes. Everything is kept on the phone first, and goes up on its own when there is a signal. Me, under This Phone, says whether every change has gone up. Claude, the companies\' links and sending need a signal.',
  },
  {
    id: 'item-form',
    topic: 'Items',
    question: 'What goes on an item?',
    answer: 'A title, what is involved, the location, who it is assigned to (a company or someone on your team), and whether it is ready. Not Ready picks what it waits on: another task on the list, the owner, or anything else. Item Form, in Me, sets which fields show and adds your own.',
  },
  {
    id: 'complete',
    topic: 'Items',
    question: 'How do I check an item off?',
    answer: 'Tap the circle on its row, or Complete on the item. Undo puts it back. Anything that was waiting on it becomes ready by itself.',
  },
  {
    id: 'to-check',
    topic: 'Items',
    question: 'What is To Check?',
    answer: "The work a company marked done from its page. Look at it, then Complete it, or tap Not Done Yet to send it back. A done photo from the company shows on the item, and Claude can compare it with the photo of the problem.",
  },
  {
    id: 'waiting',
    topic: 'Items',
    question: 'How do I show that one item has to wait on another?',
    answer: 'On the item, turn Ready off and pick what it waits on. When that task is done, the item becomes ready by itself. Group By Waiting On, in View, shows what is holding up the most work.',
  },
  {
    id: 'move-copy',
    topic: 'Items',
    question: 'How do I move, copy or assign several items at once?',
    answer: "In a location's list, tap Select at the top (or hold an item), tap the others, then pick Move, Copy, Assign or Complete at the bottom. Copied items can be pasted into another job.",
  },
  {
    id: 'companies',
    topic: 'Companies',
    question: 'How do I add a company?',
    answer: "In Me, open Companies and tap Add Company. Claude can fill it in from a photo of a business card or a pasted email signature. Put it on a job in Job Setup, under Companies, with the trade it does there.",
  },
  {
    id: 'company-page',
    topic: 'Lists and Pages',
    question: "What is a company's page?",
    answer: 'Each company has its own private page for each job, from the link on its list, with no account to set up. It shows its work and its dates; the company confirms them, marks work done with a photo and comments, and it all shows in the app right away. A page can be in Spanish.',
  },
  {
    id: 'send-lists',
    topic: 'Lists and Pages',
    question: 'How do I send a company its list?',
    answer: "Tap Send at the bottom of the job. Each company's list is ready to go by email or text, with the link to its page. Make a List builds any list you want, by any filters, and Export to a Spreadsheet sends the whole job.",
  },
  {
    id: 'nudge',
    topic: 'Lists and Pages',
    question: 'How do I remind a company that has not answered?',
    answer: "Send has a Nudge section: the companies that have not opened their page in a week, or have not confirmed their work. Nudge writes each one a short reminder with its link.",
  },
  {
    id: 'station',
    topic: 'Lists and Pages',
    question: 'What is the Job Station?',
    answer: "A link for a tablet or a TV in the house that shows every company's list on the job, for the crews on site. Turn it on from Job Station in the job's menu; it can be turned off any time.",
  },
  {
    id: 'owner-page',
    topic: 'The Owner',
    question: "What is the owner's page?",
    answer: "A private page for the owner of the house, from Owner's Page in the job's menu. It shows what waits on them, what got finished with photos and what is still open. The owner can send something to look at with a photo, and sign off a room or the whole job.",
  },
  {
    id: 'owner-update',
    topic: 'The Owner',
    question: 'Can Claude write the weekly update to the owner?',
    answer: "Yes. On the Owner's Page, tap Write This Week's Update. Claude writes it from the list as the owner sees it, by room and by trade, without naming a company. Read it, change any word, then text it, email it or copy it.",
  },
  {
    id: 'search',
    topic: 'Finding Things',
    question: 'How do I find something?',
    answer: "Search on Jobs looks through every job: items, locations, companies, people and comments, and what is in the photos. On a job, search looks through its items. In View, Ask Claude turns what you say, like what is ready for Gator on Level 2, into the list's filters.",
  },
  {
    id: 'views',
    topic: 'Finding Things',
    question: 'How do I keep a filter I use a lot?',
    answer: 'Open View on the job, set the grouping and the filters, then tap Save This View With a Name. It shows as a chip on the job, one tap away. Save as My Default makes it how every job opens.',
  },
  {
    id: 'today',
    topic: 'Finding Things',
    question: 'What is Today?',
    answer: "One screen across your jobs: what the companies answered since yesterday, what is yours, what is to check and who is on site, with the day's walk in walking order. End of Day Note has Claude write the day for the daily log.",
  },
  {
    id: 'updates',
    topic: 'Finding Things',
    question: 'What is Updates, and can I get notifications?',
    answer: 'Updates shows what happened lately on every job you see, newest first, with what is new since you last looked. Turn on notifications from Updates or in Me to be told when a company marks work done, confirms it or comments, and when the owner adds something or signs off.',
  },
  {
    id: 'stars',
    topic: 'Finding Things',
    question: 'How do I keep an item at the top?',
    answer: "Star it from its More menu. It stays at the top of its job, and Starred and Recent on Jobs has it with the items you opened lately.",
  },
  {
    id: 'claude',
    topic: 'Claude',
    question: 'What does Claude do in the app?',
    answer: "Claude fills in an item from its photo, writes down what you say, reads the plans and other people's punch lists, spots the same work written twice, checks a done photo against the problem, writes the owner's update and the end of day note, translates a company's page, finds things by what you say, and answers how to do something here. It never completes or deletes anything on its own.",
  },
  {
    id: 'claude-cost',
    topic: 'Claude',
    question: 'What does Claude cost?',
    answer: "Each company has a monthly allowance for Claude, and an admin sees this month's cost in Me, under Claude. Once it is used up, Claude waits until the first of the month.",
  },
  {
    id: 'people',
    topic: 'Your Company',
    question: 'How do I add my people?',
    answer: "In Me, open People and tap Add Person with their name and email. They sign in with that email. Their role says what they can change, and Sees says whether they see every job or only the jobs they are on. Put them on a job's team in Job Setup.",
  },
  {
    id: 'roles',
    topic: 'Your Company',
    question: 'What can each role do?',
    answer: 'An Admin runs the company: its people, companies, templates and every job. A Project Manager makes jobs and sets them up: the locations, the companies on the job and the team, and closes them. A Superintendent walks jobs, adds items, sends lists and checks the work off. View Only sees the jobs and comments, and changes nothing. Admins and project managers see every job.',
  },
  {
    id: 'sign-in-with',
    topic: 'This Phone',
    question: 'Can I sign in with Apple or Google?',
    answer: "Yes, with Continue with Apple or Continue with Google on Sign In, once your company has them. Your company knows you by your email, so use the one your admin added under People. If Apple hides your email, ask your admin to add the address Apple gives instead; it shows on Start Your Company.",
  },
  {
    id: 'templates',
    topic: 'Your Company',
    question: 'What are templates?',
    answer: "The work that always needs doing in a house, like a bathroom's mirror, towel bar and toilet. Make them in Me, under Templates, then add them to a job's locations with Add From a Template.",
  },
  {
    id: 'export',
    topic: 'Your Company',
    question: "How do I get all of my company's data out?",
    answer: 'In Me, an admin taps Export Everything: every job, item, comment and photo, in one download.',
  },
  {
    id: 'sign-out',
    topic: 'This Phone',
    question: 'What happens when I sign out?',
    answer: 'What is on the phone is cleared, after every change has gone up, and the phone stops getting notifications. It all comes back when you sign in again.',
  },
  {
    id: 'delete-account',
    topic: 'Your Company',
    question: 'How do I delete my account?',
    answer: 'In Me, tap Delete My Account. Your sign in goes, and your name, email and phone come off everything you did. The last one at a company takes the whole company with them.',
  },
];

// ---------- Ask Claude how ----------

export interface HowInput {
  question: string;
}

const tidy = (v: unknown, most: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, most) : '');

export function howInput(v: unknown): HowInput {
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return { question: tidy(r.question, 300) };
}

export function howPrompt(input: HowInput): string {
  return [
    "Someone using a phone app for a home builder's running list of work on each job asked how to do something in it. Answer from the app's help below, and from nothing else.",
    '',
    `They asked: "${input.question}"`,
    '',
    'The help, each entry with its id in brackets:',
    ...HELP.map((h) => `[${h.id}] ${h.question} ${h.answer}`),
    '',
    'Rules:',
    '- Answer in two or three short plain sentences, the steps in order, with the names of the buttons and screens exactly as the help writes them.',
    '- When the help does not cover it, say so in one sentence and give the closest entry. Never make up a button, a screen or a feature.',
    '- Do not use dashes or hyphens.',
    '',
    'Reply with only JSON, like {"answer": "Tap Send at the bottom of the job...", "topics": ["send-lists"]}, with the ids of the entries you used, the most useful first, at most three.',
  ].join('\n');
}

export interface HowAnswer {
  answer: string;
  topics: string[];
}

/** Claude's answer and the help entries it used; null when it said nothing usable. */
export function readHow(raw: unknown): HowAnswer | null {
  let v: unknown = raw;
  if (typeof raw === 'string') {
    const m = raw.match(/\{[\s\S]*\}/);
    try {
      v = m ? JSON.parse(m[0]) : null;
    } catch {
      v = null;
    }
  }
  const r = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const answer = tidy(r.answer, 1200).replace(/\s[-–—]\s/g, ', ');
  if (!answer) return null;
  const known = new Set(HELP.map((h) => h.id));
  const topics = Array.isArray(r.topics) ? [...new Set(r.topics.filter((t): t is string => typeof t === 'string' && known.has(t)))].slice(0, 3) : [];
  return { answer, topics };
}

/** The entries whose question or answer has every word typed, best matches first. */
export function searchHelp(query: string): HelpEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...HELP];
  return HELP.map((h) => {
    const q = h.question.toLowerCase();
    const a = h.answer.toLowerCase();
    if (!words.every((w) => q.includes(w) || a.includes(w))) return null;
    return { h, rank: words.filter((w) => q.includes(w)).length };
  })
    .filter((x): x is { h: HelpEntry; rank: number } => x !== null)
    .sort((x, y) => y.rank - x.rank)
    .map((x) => x.h);
}
