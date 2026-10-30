# Phase 1: The camera walk, the list and job setup

**Goal:** the app on Jake's iPhone, working with no signal. He opens the app, picks the job, opens the camera, snaps a photo, marks it up or leaves it as is, and fills in the item as easily as possible. The list is kept by level and room, and filters and defaults are his to set.

**Plan:** [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a), section 5. Photos and markup moved into this phase on 29 October 2026, at Jake's direction ("open app, select job, open camera, snap picture, mark up or leave as is, then fill out info").

**Design:** [Punch List App Design](https://claude.ai/artifact/MkYkFBRyhwxCDGG488omuC), the approved canvas. Jake's review asked for less text up front, the rest one tap in, very calm and easy to use, with a clear way to check things complete.

## The walk

1. **Jobs** opens to the job.
2. **The job** lists each level and its locations with how many items are open, and a check where nothing is open. To Fill In and Past Due sit at the top when there are any. The bar at the bottom has the camera in the middle, Schedule on the left and View on the right. Search is under the magnifying glass, Send Lists under the share button.
3. **The camera** shows the location the photos go to at the top; tap it to change it. The shutter, the photo library, and Skip Photo for an item without one. **Fill In Later** (beside Fill In Now, over the shutter) is for going around fast: each photo saves as it is taken, as an item in the location at the top, to mark up and fill in later sitting down.
4. **Markup:** draw, arrow, circle, box or a short note, in red, yellow, white or black, with Undo. Next leaves the photo as it is when nothing was drawn.
5. **New Item:** the location is already filled in. Typing a title offers the standard titles, and picking one fills in the trade and the company. Ready is a checkbox: unchecking it opens a small box to tick what the item waits on, one thing or several (the job's companies, Ross Built, the owner, the design team, or something else typed in), and when it should be ready. Waiting On is always a who: a company, Ross Built, the owner, the design team, or someone else typed in; what it waits for goes in the description. The type is one tap: Deficiency (wrong or damaged, to fix), Incomplete (scope completion: their work, not done yet) or Additional (extra work that needs a price, with its purchase order or change order number once it is priced). Bought Out is not asked for; it follows the type and the number. Added fields wait under More Details. Save and Next goes straight back to the camera for the next one; Save goes back to the list. Saving without the company (or the title, with a photo) keeps it to fill in later instead of stopping. The same title already in the location is pointed out. Fill In From Photo asks Claude to fill in what is blank from the photo, its marks, the location, the standard titles and the companies on the job; it never overwrites what was typed.
6. **A location** lists its items calmly: a large circle to check one off, the title, a small hourglass when it is not ready, the days in red under the title when it is past due, and the photo. An item to fill in has a pencil instead of the circle and says what it still needs. Completed items wait under their own heading. The bottom bar steps to the location before or after, with the camera between. Checking off a company's last item in a location offers to mark ready what was waiting on that company there.
7. **An item** is the same simple form, changed right where it is: tap the title or description to retype it, tick Ready, pick another location or company, Mark Up a photo. Each change saves as it is made; there is no Edit button. Its photos with their marks are above (tap for the whole photo, Mark Up or Add Photo), its visit is below, and Mark Complete is the big button. An item to fill in says what it still needs and steps to the next one, for filling them in after a walk.
8. **View and Filter** groups the job by location, trade, company or what items wait on (To Fill In, Ready Now and Needs a Price first, then each thing waited on with how many items it holds up, the late ones first, so work that can go together shows as a batch), shows all open, ready, not ready or additional, narrows to one trade or company, and Save as My Default makes every job open that way. A Waiting On list moves the Ready By for all its items at once, or with Stop Waiting marks them all ready (with Undo).
9. **Item Form** turns the form's fields on or off, sets what a new item starts as, adds Ross Built's own fields (text, a list, yes or no, or a date), and keeps the standard title list.
10. **Past Due** lists everything late, the latest first, with the days: not ready past its Ready By, or still open after its visit ended.
11. **Schedule** is built from the list: what is past due, each company's visits this week, next week and later (confirmed, or our best guess), and the companies with work not scheduled yet. Each company's **plan** shows its visits, what is ready now and not scheduled, what comes free and when, what has no date yet, and additional work that needs a price. Schedule These picks the start (with more than a day of notice, and a day of handoff after what it waits on is done), the working days, whether the company confirmed it, and which items it covers. Ready means priced too: additional work is scheduled once it has its order number.
12. **Send Lists** (the share button on the job) lists every company with open work, how much of it is ready now, and what is new since its last list. Tap one for its list as a PDF in the house document style: its scheduled visits with their items, what is ready now, then what is waiting grouped by what it waits on (soonest first), each batch with a line for the days it takes, then additional work that needs a price, and blank lines to add anything missing; the location on every line, each item's first photo with its markup, New beside anything not on the last list, and page numbers in the footer. It opens in the phone's PDF viewer to look over and send by email or text; the share button beside each company goes straight to sending, and Send All goes through every company in one pass. Each list sent is recorded, with Undo. The owner and the design team get what Ross Built needs from them and by when. The whole job list, level by level and location by location with the trade, company and any days past due on every line, is for Ross Built; it leaves the photos off to stay short.

## What gets built

| Piece | Where | What it does |
| --- | --- | --- |
| Phone app | `apps/mobile` | Expo SDK 58, TypeScript, Expo Router. The walk above, job setup, and the item rules. The camera is `expo-camera`, the photo library `expo-image-picker`, markup is drawn with `react-native-svg`, and photos are kept in the app's own folder until they upload. The lists become PDFs with `expo-print` (the house font, Nunito Sans, and the photos are written into the page, and `pdf-lib` adds the footer with page numbers) and go out through the share sheet. Fill In From Photo calls Claude through a server function on the phone, and through the preview page's own Claude access on the preview. Built to look and work like Apple's own apps (see Look and feel). |
| Core rules | `packages/core` | The data types and the rules the app enforces: not ready needs Waiting On, one company and one trade per item, only Ross Built completes, removing never deletes, room labels and floor order from a pasted list. Also the marks (points on the photo, drawn at any size), title suggestions and what a title fills in, the form and view settings, the added fields, and the lists that go out (each company's, and the whole job) with their printed pages. Shared by the app, the server and the tests. |
| Database | `supabase/` | Migrations for the schema and access rules, the private photos bucket, plus a seed for a test job of 600 generated items. |
| Sync | `powersync/` | The PowerSync service config and sync streams: every signed-in Ross Built user gets every job; each person gets only their own settings. |

## Look and feel

The app follows Apple's design for iPhone, modeled on Camera, Markup, Reminders and Settings. The parts live in `apps/mobile/src/ui`; every screen is built from them.

- **Theme:** white and light gray, near black text, and one accent, Ross Built slate blue, for everything you can tap. Red only for removing and past due. Status is said in words, with a small gray icon where it helps.
- **Calm lists:** the least text up front. A room's row is its name and a count; an item's row is the circle, the title, an hourglass when not ready, and the photo. Everything else is one tap in.
- **The camera bar:** a large camera button in the middle of the bottom bar on every job and room screen, big enough to hit without looking.
- **Navigation and sheets:** large titles that shrink into the bar, New Item, Send Lists, View and Item Form as sheets with Cancel and Done, the camera full screen, and Cancel asks before throwing away a new item.
- **Motion and touch:** rows light up the instant they are touched; buttons press in; the circle fills and the check pops in.

On the iPhone these are the system's own: the native navigation bar, SF Symbols, native menus and action sheets, page sheets that close with a swipe down, the live camera, the system switch and date picker, swipe back, and haptic taps. The preview page draws the same design in the browser; there the shutter opens the iPhone's own camera through the browser, and the live viewfinder, haptics and swipe back can only be judged on the TestFlight build.

## How Jake sees it

- **Preview link:** [Punch List Preview](https://claude.ai/artifact/JeNrTrbh3PNZE7YeNTcYmV), the app on sample data in the iPhone's browser. Rebuilt with `npm run preview:build`, walked with `npm run test:preview`, then republished after each step. The sample photos are drawings, not job photos.
- **TestFlight:** the real app, once the Apple Developer account is active. Checks C3, C4 and C7 to C10 run there.
- Not Expo Go: it cannot load the app's offline database, and the App Store version is a release behind SDK 58.

## Data model, Phase 1 slice

| Table | Holds |
| --- | --- |
| people | Ross Built users by email, with active on or off. Only active people can read or write anything. |
| jobs | Name and address. |
| locations | Each location on a job (a room or area from the plans, or one of the shared ones): name, plan number, label, level, floor order. |
| trades | One standard list. |
| companies | Name, usual trade, phone, email. |
| job_companies | Which companies are on a job, for which trade. |
| job_waiting_on | Extra Waiting On choices per job (Ross Built, Owner, the design team by name). The job's companies are choices automatically. |
| items | The Completion List item: location, number, title, description, trade, company, type (deficiency, completion or added_scope, shown as Deficiency, Incomplete and Additional), Ready, Waiting On (one thing or several), Ready By, the order number, Bought Out (kept by the database from the type and the order number, for Buildertrend), status, who completed it and when, source, the answers to the added fields, unfinished (to fill in), its visit, an empty Buildertrend link. An item to fill in may wait for its title, company and trade, and cannot be completed. |
| visits | A company's trip to the job for a batch of items: first day, working days, confirmed or our best guess. An item goes only on its own company's visit. Never deleted; removing sets removed. |
| list_sends | Each list that went out: which list, the items on it, when and by whom, so the next one marks what is new. Undo sets removed. |
| item_history | Every change to an item: who, when, field, before, after, source. Written by the database, not the app. |
| title_library | Standard titles by trade, how often used, approved or not. Picking one fills in the trade and the company. |
| photos | An item's photos: size, order, where it is in storage once uploaded, and the marks drawn on it. Never deleted; removing sets removed. The picture itself is in the private photos bucket. |
| custom_fields | The fields Ross Built adds to the item form: name, kind (text, list, yes or no, date) and the choices for a list. |
| person_settings | Each person's Item Form setup and the view they saved as their default. A person sees only their own. |

Item numbers are job-wide and assigned by the database on first sync; an item made offline shows "New" until then.

## Sign-in

A one-time code sent to the person's email. Anyone can request a code, but an account whose email is not an active person sees nothing: the access rules check the email on every read and write.

## Checks

| Check | Passes when |
| --- | --- |
| C1 Rooms | Pasting Fish's room list shows every room in floor order with its number, plus the shared areas (four elevations, Roof, Pool, Driveway, Site, Whole House). |
| C2 Speed | On a test job of 600 generated items, the list opens in under 2 seconds. |
| C3 Offline | In airplane mode on the test job: edit 5 items and complete 2. Back online, those changes are in the database within a minute. (TestFlight build.) |
| C4 No loss | Force quit in the middle of an edit: nothing is lost. (TestFlight build.) |
| C5 Access | An account that was not invited sees nothing, and can write nothing. |
| C6 Rules | The core rules hold on every write path: unit tests in `packages/core`, and database tests for the access rules, item history and photos. |
| C7 Walk | With no signal, 10 items with photos across 3 locations using Save and Next, typing only titles; each lands in its location with its photo and marks, and uploads when back online. (TestFlight build.) |
| C8 Marks | A marked photo looks the same in the list, on the item and full screen, and the original photo is unchanged. |
| C9 Lists | On the iPhone, a company's list opens as a PDF in the house style with the location on every line, each photo's marks where they were drawn and page numbers in the footer, and goes out by Mail and by Messages. (TestFlight build.) |
| C10 Fill In Later | With no signal, 10 Fill In Later photos across 3 locations each land as an item to fill in, in its location; sitting down, each is marked up and filled in with Next, and none reaches a list until it is filled in. (TestFlight build.) |

## Needs from Jake

1. Supabase: a new project, `punch-list`. Its URL, anon key, and database connection string with password.
2. PowerSync: an account and an access token.
3. Expo: an account and an access token, for the TestFlight build and the updates after it.
4. Apple Developer account, for the TestFlight build (checks C3, C4 and C7 to C10).
5. Fish's room list: the plan callouts with their numbers, in floor order.
6. The standard titles: the preview starts from a list of about fifty by trade; Fish's own completion list would make it real.
7. Fill In From Photo on the iPhone: an Anthropic API key for the `suggest-item` server function (the preview link uses the viewer's own Claude instead).
8. Fish's list from Buildertrend: one pasted session (Copy as cURL from Chrome) for the read-only import, `npm run import:buildertrend`, which writes `local/fish-import.json` to load once the database exists. It never writes to Buildertrend.

Secrets live only in `local/` in the build workspace, which git ignores.

## Status (30 October 2026)

- Built: the core rules, the schema and access rules (`npm run test:db` passes), the sync config, the data layer with a sample-data backend, job setup, and the walk: the job by level and location, calm location lists with previous and next, the camera with the location at the top and Fill In Later, markup (also on saved photos), the quick New Item form with title suggestions that fill in the trade and company, Fill In From Photo, duplicate notes, Save and Next, save now and finish later, the item screen edited in place with the Ready checkbox and Mark Complete, To Fill In with Next, Past Due with the days, View and Filter with Save as My Default and the Waiting On grouping, Stop Waiting, release on complete, the Schedule with each company's plan and visits, Item Form setup with added fields and the standard titles, Send Lists with Send All, sent records and the owner's list, and the read-only Fish import from Buildertrend.
- Redesigned twice on 29 October to Jake's reviews: first to Apple's design, then to the clean single-accent theme and the calm lists on the approved canvas. On 30 October, to his review: no Edit button, Ready as a checkbox with the Not Ready box, Waiting On as one thing or several, and the lists sent to the subs; then the schedule built from the list, Fill In Later drafts, past due with the days, and the rest of his improvement list. Then a wording pass to his review: Location for room, one word for each thing on every screen and printed list, the three types (Deficiency, Incomplete, Additional) in place of Bought Out, and shorter notes.
- Checked: 88 unit tests, both type checks, lint, the database checks, and a 25-step walk-through at iPhone size under the preview page's rules with no errors. The PDF itself is made on the iPhone and is checked on the TestFlight build; the preview page shows the same page on screen. The footer stamp was checked on a real PDF.
- Next: the phone's real backend (PowerSync and Supabase) with photo upload once the accounts exist, then sign-in and checks C3 to C9 on the TestFlight build. The app icon and launch screen are still the Expo defaults.
