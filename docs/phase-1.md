# Phase 1: App foundation and job setup

**Goal:** the app on Jake's iPhone with Fish set up by room, working with no signal.

**Plan:** [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a), section 5.

## What gets built

| Piece | Where | What it does |
| --- | --- | --- |
| Phone app | `apps/mobile` | Expo SDK 58, TypeScript, Expo Router. Sign in, jobs, rooms in floor order with open counts, a room's items, item detail and edit, mark complete, job setup. |
| Core rules | `packages/core` | The data types and the rules the app enforces: not ready needs Waiting On, one company and one trade per item, only Ross Built completes, removing never deletes, room labels and floor order from a pasted list. Shared by the app, the server and the tests. |
| Database | `supabase/` | Migrations for the schema and access rules, plus a seed for a test job of 600 generated items. |
| Sync | `powersync/` | The PowerSync service config and sync streams: every signed-in Ross Built user gets every job. |

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

- Built: the core rules, the schema and access rules (`npm run test:db` passes), the sync config, the data layer with a sample-data backend, and the first screens: jobs, the Completion List by room, trade or company with the filters, the item form with the rules, complete, reopen, remove and restore, and job setup (paste rooms, companies, Waiting On choices).
- Checked: 32 unit tests, both type checks, and a 9-step walk-through at iPhone size under the preview page's rules with no errors.
- Next: the phone's real backend (PowerSync and Supabase) once the accounts exist, then sign-in and checks C3 to C5 on the TestFlight build.
