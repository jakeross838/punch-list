# Phase 1: App foundation and job setup

**Goal:** the app on Jake's iPhone with Fish set up by room, working with no signal.

**Plan:** [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a), section 5.

## What gets built

| Piece | Where | What it does |
| --- | --- | --- |
| Phone app | `apps/mobile` | Expo SDK 58, TypeScript, Expo Router. Sign in, jobs, rooms in floor order with open counts, a room's items, item detail and edit, mark complete, job setup. Built to look and work like Apple's own apps (see Look and feel). |
| Core rules | `packages/core` | The data types and the rules the app enforces: not ready needs Waiting On, one company and one trade per item, only Ross Built completes, removing never deletes, room labels and floor order from a pasted list. Shared by the app, the server and the tests. |
| Database | `supabase/` | Migrations for the schema and access rules, plus a seed for a test job of 600 generated items. |
| Sync | `powersync/` | The PowerSync service config and sync streams: every signed-in Ross Built user gets every job. |

## Look and feel

The app follows Apple's design for iPhone, modeled on Reminders and Settings. The parts live in `apps/mobile/src/ui`; every screen is built from them.

- **Type and color:** Apple's text styles (34 point large titles, 17 point body), the iOS system grays and fills, Ross Built blue as the one accent. Status text uses Apple's increased contrast colors so it reads outdoors.
- **Navigation:** large titles that shrink into the bar as you scroll, glass bar buttons, a "…" menu for Group By, Show Completed and Job Setup, and New Item in a floating bottom toolbar.
- **The list:** count tiles (Open, Ready, Not Ready, Added Scope) that filter, search, rooms as rounded sections under sticky headers, a circle to check an item off, swipe left for Ready and Remove, and Undo after a removal.
- **Sheets:** New Job, New Item and an item's details slide up as sheets with Cancel and Done, the screen behind shrinking back. Pickers are searchable lists with a checkmark. Cancel asks before throwing away changes.
- **Motion and touch:** rows light up the instant they are touched and fade back; buttons and tiles press in; one decelerating curve for nearly everything, Apple's sheet curve for sheets.

On the iPhone these are the system's own: the native navigation bar and large titles, SF Symbols, native menus and action sheets, page sheets that close with a swipe down, the system switch and date picker, swipe back, and haptic taps. The preview page draws the same design in the browser, so the look and the motion can be judged there; haptics, swipe back and the native menus can only be judged on the TestFlight build.

## How Jake sees it

- **Preview link:** [Punch List Preview](https://claude.ai/artifact/JeNrTrbh3PNZE7YeNTcYmV), the app's screens on sample data in the iPhone's browser. Rebuilt with `npm run preview:build`, walked with `npm run test:preview`, then republished after each step.
- **TestFlight:** the real app, once the Apple Developer account is active. Checks C3 and C4 run there.
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
| items | The Completion List item: location, number, title, description, trade, company, Deficiency or Added Scope, Ready, Waiting On, Ready By, Bought Out, PO or CO, status, who completed it and when, source, an empty Buildertrend link. |
| item_history | Every change to an item: who, when, field, before, after, source. Written by the database, not the app. |
| title_library | Standard titles by trade, how often used, approved or not. |

Item numbers are job-wide and assigned by the database on first sync; an item made offline shows "New" until then. Photos, drafts and duplicates arrive with Phases 3 and 4.

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
| C6 Rules | The core rules hold on every write path: unit tests in `packages/core`, and database tests for the access rules and item history. |

## Needs from Jake

1. Supabase: a new project, `punch-list`. Its URL, anon key, and database connection string with password.
2. PowerSync: an account and an access token.
3. Expo: an account and an access token, for the TestFlight build and the updates after it.
4. Apple Developer account, for the TestFlight build (checks C3 and C4).
5. Fish's room list: the plan callouts with their numbers, in floor order.

Secrets live only in `local/` in the build workspace, which git ignores.

## Status (29 October 2026)

- Built: the core rules, the schema and access rules (`npm run test:db` passes), the sync config, the data layer with a sample-data backend, and the screens: jobs, the Completion List by room, trade or company with the filters, the item form with the rules, complete, reopen, remove and restore, and job setup (paste rooms, companies, Waiting On choices).
- Redesigned the same day to Apple's design (Look and feel above), after Jake's review of the first screens. Show Completed added to the core list views.
- Checked: 33 unit tests, both type checks, lint, the database checks, and a 14-step walk-through at iPhone size under the preview page's rules with no errors.
- Next: the phone's real backend (PowerSync and Supabase) once the accounts exist, then sign-in and checks C3 to C5 on the TestFlight build. The app icon and launch screen are still the Expo defaults.
