# Punch List

A running list of everything that still needs to be done on a job, not just the punch: a super or a PM walks the job, takes marked-up photos of what is left to do, and each company gets its list. Any builder can use it: anyone signs up with their email, names their company and is its admin, then adds their people. Built first for Ross Built.

Plan: [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a). Current phase: [Phase 1, the camera walk, the list and job setup](docs/phase-1.md). Design: [Punch List App Design](https://claude.ai/artifact/MkYkFBRyhwxCDGG488omuC). Preview: [Punch List Preview](https://claude.ai/artifact/JeNrTrbh3PNZE7YeNTcYmV), the screens on sample data. The Buildertrend connection ([Phase 0](docs/phase-0.md)) is built and parked; it is not part of version 1.

## Layout

```
apps/mobile             The phone app: Expo SDK 58, TypeScript, Expo Router. Its iOS design parts are in src/ui
packages/core           The data types and the rules every item follows, shared by the app, the server and the tests
supabase                Database migrations, access rules, the test job seed and the database checks
powersync               The offline sync service config
packages/buildertrend   Parked: Buildertrend client, read-back checks, snapshots, Phase 0 checks
apps/extension          Parked: Chrome extension that runs inside a logged-in Buildertrend tab
tools                   Development runners and browser tests
docs                    One brief per phase, with its checks
local                   Sessions, exports, previews and reports. Ignored by git, never committed.
```

## Commands

```
npm test                  unit tests for the shared packages
npm run typecheck         TypeScript, strict (the phone app: cd apps/mobile && npx tsc --noEmit)
cd apps/mobile && npx expo lint   lint for the phone app
npm run test:db           migrations, access rules and item history on a fresh local Postgres
npm run preview:build     exports the app for the web and builds the one-page preview in local/preview
npm run test:preview      walks the preview at iPhone size in Chromium, under the preview page's rules
npm run import:buildertrend   reads a job's Completion List from Buildertrend, read only, into local/ for loading
npm run build:extension   parked: builds the Buildertrend extension
npm run test:extension    parked: runs the extension in Chromium against the stand-in Buildertrend
```

## Rules the code enforces

- Not ready means it says who it waits on: one or several. One company and one trade per item.
- A draft (a photo taken in Draft mode, or an item saved before its company was known) may wait for its title, company and trade, stays off every list, and cannot be completed until it is filled in.
- Each item is a Deficiency, Incomplete (scope completion) or Additional. Additional work counts as priced, and ready to go ahead, once it has its purchase order or change order number; Bought Out follows from that and is never asked for.
- The schedule (visits, Ready By dates, estimated time, the Schedule Email), plans, To Check and the company pages are out of the app for now. Their tables stay in the database, and the company page functions are closed to everyone but the database.
- Only someone switched on at the company marks an item complete.
- Removing an item marks it Removed. Nothing is ever deleted, photos included, except when the last person at a company deletes their account: then the whole company goes.
- Marks are kept apart from the photo, as points on it, so the original photo is never changed.
- A standard title fills in its trade, and the company doing that trade on the job.
- Each company sees only its own rows. Every read and write is checked against the signed-in person's company, the database fills in the company on every row itself, and each phone gets only its own company's rows.
- An email is with one company at most. Names that must be unique (companies, trades, standard titles) are unique within a company.
- Secrets and sessions live only in `local/`, which git ignores.
