# Phase 1: The camera walk, the list and job setup

**Goal:** the app on Jake's iPhone, working with no signal. He opens the app, picks the job, opens the camera, snaps a photo, marks it up or leaves it as is, and fills in the item as easily as possible. The list is kept by level and room, and filters and defaults are his to set.

**Plan:** [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a), section 5. Photos and markup moved into this phase on 29 October 2026, at Jake's direction ("open app, select job, open camera, snap picture, mark up or leave as is, then fill out info").

**Design:** [Punch List App Design](https://claude.ai/artifact/MkYkFBRyhwxCDGG488omuC), the approved canvas. Jake's review asked for less text up front, the rest one tap in, very calm and easy to use, with a clear way to check things complete.

## The walk

1. **Jobs** opens to the job.
2. **The job** lists each level and its rooms with how many items are open, and a check where nothing is open. The bar at the bottom has the camera in the middle, with By Room and Filter on either side. Search is under the magnifying glass.
3. **The camera** shows the room the photos go to at the top; tap it to change rooms. The shutter, the photo library, and No Photo for an item without one.
4. **Markup:** draw, arrow, circle, box or a short note, in red, yellow, white or black, with Undo. Next leaves the photo as it is when nothing was drawn.
5. **New Item:** the room is already filled in. Typing a title offers the standard titles, and picking one fills in the trade and the company. Ready is a checkbox: unchecking it opens a small box to tick what the item waits on, one thing or several (the job's companies, Ross Built, the owner, the design team, or something else typed in), and when it should be ready. Deficiency or Added Scope is one tap; the rest waits under More Details. Save and Next goes straight back to the camera for the next one; Save goes back to the list. Another photo for the same item is one tap away, and the form is kept while it is taken.
6. **A room** lists its items calmly: a large circle to check one off, the title, a small hourglass when it is not ready, and the photo. Completed items wait under their own heading. The bottom bar steps to the room before or after, with the camera between.
7. **An item** is the same simple form, changed right where it is: tap the title or description to retype it, tick Ready, pick another room or company. Each change saves as it is made; there is no Edit button. Its photos with their marks are above (tap for the whole photo, or Add Photo), and Mark Complete is the big button.
8. **View and Filter** groups the job by room, trade, company or what items wait on (Ready Now first, then each holdup with how many items it holds up, so work that can go together shows as a batch), shows all open, ready, not ready or added scope, narrows to one trade or company, and Save as My Default makes every job open that way.
9. **Item Form** turns the form's fields on or off, sets what a new item starts as, adds Ross Built's own fields (text, a list, yes or no, or a date), and keeps the standard title list.
10. **Send Lists** (the share button on the job) lists every company with open work and how much of it is ready now. Tap one for its list as a PDF in the house document style: Ready Now, then Waiting grouped by what each item waits on (soonest Ready By first), the room on every line, each item's first photo with its markup, a Days column for the sub to fill in, and blank lines to add anything missing. It opens in the phone's PDF viewer to look over and send by email or text; the share button beside each company goes straight to sending. The whole job list, floor by floor and room by room with the trade and company on every line, is for Ross Built; it leaves the photos off to stay short.

## What gets built

| Piece | Where | What it does |
| --- | --- | --- |
| Phone app | `apps/mobile` | Expo SDK 58, TypeScript, Expo Router. The walk above, job setup, and the item rules. The camera is `expo-camera`, the photo library `expo-image-picker`, markup is drawn with `react-native-svg`, and photos are kept in the app's own folder until they upload. The lists become PDFs with `expo-print` (the house font, Nunito Sans, and the photos are written into the page) and go out through the share sheet. Built to look and work like Apple's own apps (see Look and feel). |
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
- **TestFlight:** the real app, once the Apple Developer account is active. Checks C3, C4, C7, C8 and C9 run there.
- Not Expo Go: it cannot load the app's offline database, and the App Store version is a release behind SDK 58.

## Data model, Phase 1 slice

| Table | Holds |
| --- | --- |
| people | Ross Built users by email, with active on or off. Only active people can read or write anything. |
| jobs | Name and address. |
| locations | Room or area per job: name, plan number, label, floor, room or shared area, floor order. |
| trades | One standard list. |
| companies | Name, usual trade, phone, email. |
| job_companies | Which companies are on a job, for which trade. |
| job_waiting_on | Extra Waiting On choices per job (Ross Built, Owner, the design team by name). The job's companies are choices automatically. |
| items | The Completion List item: location, number, title, description, trade, company, Deficiency or Added Scope, Ready, Waiting On (one thing or several), Ready By, Bought Out, PO or CO, status, who completed it and when, source, the answers to the added fields, an empty Buildertrend link. |
| item_history | Every change to an item: who, when, field, before, after, source. Written by the database, not the app. |
| title_library | Standard titles by trade, how often used, approved or not. Picking one fills in the trade and the company. |
| photos | An item's photos: size, order, where it is in storage once uploaded, and the marks drawn on it. Never deleted; removing sets removed. The picture itself is in the private photos bucket. |
| custom_fields | The fields Ross Built adds to the item form: name, kind (text, list, yes or no, date) and the choices for a list. |
| person_settings | Each person's Item Form setup and the view they saved as their default. A person sees only their own. |

Item numbers are job-wide and assigned by the database on first sync; an item made offline shows "New" until then. Drafts and duplicate checks arrive with Phases 3 and 4.

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
| C7 Walk | With no signal, 10 items with photos across 3 rooms using Save and Next, typing only titles; each lands in its room with its photo and marks, and uploads when back online. (TestFlight build.) |
| C8 Marks | A marked photo looks the same in the list, on the item and full screen, and the original photo is unchanged. |
| C9 Lists | On the iPhone, a company's list opens as a PDF in the house style with the room on every line and each photo's marks where they were drawn, and goes out by Mail and by Messages. (TestFlight build.) |

## Needs from Jake

1. Supabase: a new project, `punch-list`. Its URL, anon key, and database connection string with password.
2. PowerSync: an account and an access token.
3. Expo: an account and an access token, for the TestFlight build and the updates after it.
4. Apple Developer account, for the TestFlight build (checks C3, C4, C7, C8 and C9).
5. Fish's room list: the plan callouts with their numbers, in floor order.
6. The standard titles: the preview starts from a list of about fifty by trade; Fish's own completion list would make it real.

Secrets live only in `local/` in the build workspace, which git ignores.

## Status (30 October 2026)

- Built: the core rules, the schema and access rules (`npm run test:db` passes), the sync config, the data layer with a sample-data backend, job setup, and the walk: the job by level and room, calm room lists with previous and next room, the camera with the room at the top, markup, the quick New Item form with title suggestions that fill in the trade and company, Save and Next, the item screen edited in place with the Ready checkbox and Mark Complete, View and Filter with Save as My Default and the Waiting On grouping, Item Form setup with added fields and the standard titles, and Send Lists.
- Redesigned twice on 29 October to Jake's reviews: first to Apple's design, then to the clean single-accent theme and the calm lists on the approved canvas. On 30 October, to his review: no Edit button, Ready as a checkbox with the Not Ready box, Waiting On as one thing or several, and the lists sent to the subs.
- Checked: 51 unit tests, both type checks, lint, the database checks, and a 20-step walk-through at iPhone size under the preview page's rules with no errors. The PDF itself is made on the iPhone and is checked on the TestFlight build; the preview page shows the same page on screen.
- Next: the phone's real backend (PowerSync and Supabase) with photo upload once the accounts exist, then sign-in and checks C3 to C9 on the TestFlight build. The app icon and launch screen are still the Expo defaults.
