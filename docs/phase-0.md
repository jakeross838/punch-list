# Phase 0: Prove the Buildertrend connection

**Goal:** a Chrome extension that, inside a logged-in Buildertrend tab, reads the whole Fish completion list and writes to the sandbox job, using the recipes verified in the Buildertrend skill. No app yet.

**Plan:** [Punch List App: Version 1 Plan](https://claude.ai/artifact/8aKXo8iiTrKoH78Q1Mce7a), section 5.

## What is built

| Piece | Where | What it does |
| --- | --- | --- |
| Buildertrend client | `packages/buildertrend` | Task routes, the content type rule, read-back checks, snapshots and diffs. Shared later by the app's sync. |
| Phase 0 checks | `packages/buildertrend/src/phase0.ts` | The read checks (Fish) and the write checks (sandbox only). |
| Extension | `apps/extension` | A panel inside Buildertrend that runs the checks through the page's own session and downloads a report. |
| Development runner | `tools/phase0.ts` | The same checks from this workspace, through a pasted session, for discovery. |
| Stand-in Buildertrend | `packages/buildertrend/test/fakeBuildertrend.ts` | Lets the tests and the browser test run the checks without touching the real account. |

## How to run

In this workspace, with a session pasted from Chrome (Copy as cURL of any buildertrend.net request):

```
npm run phase0 -- session "<the pasted command>"
npm run phase0 -- read     # Fish, read only
npm run phase0 -- write    # sandbox only
```

In Chrome: unzip `apps/extension/punch-list-bridge.zip`, open `chrome://extensions`, turn on Developer mode, choose Load unpacked, pick the folder. Open Buildertrend, click the extension button, run 1, then 2, then download the report.

## Checks

| Check | Passes when |
| --- | --- |
| R1 Session | The job list reads. |
| R2 Fields | All six task fields exist: Location 553258, Ready 553297, Waiting On 553668, Ready By 554342, Bought Out 554343, PO / CO 554344. |
| R3 Tags | The task tag list reads, and whether a DELETE tag exists is reported. |
| R4 Fish list | Rooms and items are found; counts are reported. |
| R5 Nothing lost | Every punch list task is a room, an item, or reported as outside a room or nested deeper. |
| R6 Second read | Each sampled item reads the same through the single-task route as through the list. |
| R7 Attachments | The attachment shape is captured, for the photo recipe. |
| R8 Spot check | You compare 20 sampled rows with the Buildertrend screen. |
| W0 Guard | A write to Fish is refused before any request goes out. |
| W1 to W2 | A test room and an item in it are created and read back. |
| W3 Fields | All six fields read back as written; the working recipe is recorded. |
| W4 to W8 | Assignee, trade tag, edit, complete and reopen, and the DELETE tag each read back. |
| W9 Photo | Blocked until one captured request of attaching a photo to a task. |
| W10 Only ours | The before and after snapshot of the sandbox shows only the test room and item. |
| W11 Clean | After the test removes its own two tasks, the sandbox matches its starting snapshot. |
| W12 Notification | You confirm the test sub got nothing. |

**Gate:** if writing from the extension fails, a fallback is chosen with Jake before Phase 1.

## Status

- Built and tested against the stand-in: `npm test` (14 tests) and `npm run test:extension` (the extension in Chromium).
- Waiting on a live session for discovery: the custom field write recipe (W3), the photo recipe (W9), and the real counts.
