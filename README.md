# Punch List

Ross Built's punch list app: walk the job, take marked-up photos, and the Completion List builds and keeps itself current, with Buildertrend kept in step.

Plan: [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a). Current phase: [Phase 0, the Buildertrend connection](docs/phase-0.md).

## Layout

```
packages/buildertrend   Buildertrend client: task routes, read-back checks, snapshots, Phase 0 checks
apps/extension          Chrome extension: runs inside a logged-in Buildertrend tab
tools                   Development runners (pasted session, browser test)
docs                    One brief per phase, with its checks
local                   Sessions, exports and reports. Ignored by git, never committed.
```

## Commands

```
npm test                  unit tests, against the stand-in Buildertrend
npm run typecheck         TypeScript, strict
npm run build:extension   builds apps/extension/dist and punch-list-bridge.zip
npm run test:extension    runs the built extension in Chromium against the stand-in
npm run phase0 -- read    Phase 0 read checks through a pasted session (see docs/phase-0.md)
```

## Rules the code enforces

- No default job. Every write names its job, and Phase 0 can only write to the sandbox job.
- Every write is confirmed by reading it back, never by the response code.
- The app never deletes in Buildertrend; removed items get the DELETE tag. The only deletes are the Phase 0 test's own tasks on the sandbox.
- A Buildertrend session is never committed or sent anywhere. The extension uses the page's own session and stores nothing.
