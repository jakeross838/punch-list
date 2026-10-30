# Punch List

Ross Built's punch list app: walk the job, take marked-up photos, and the Completion List builds and keeps itself current.

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
npm run build:extension   parked: builds the Buildertrend extension
npm run test:extension    parked: runs the extension in Chromium against the stand-in Buildertrend
```

## Rules the code enforces

- Not ready means it says what it waits on: one thing or several. One company and one trade per item.
- Only an active Ross Built user marks an item complete.
- Removing an item marks it Removed. Nothing is ever deleted, photos included.
- Marks are kept apart from the photo, as points on it, so the original photo is never changed.
- A standard title fills in its trade, and the company doing that trade on the job.
- Every signed-in person is checked against the Ross Built people list on every read and write.
- Secrets and sessions live only in `local/`, which git ignores.
