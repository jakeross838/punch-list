# Setup

How each service behind the app is set up, and where its secrets are kept. Secrets are kept only in `local/secrets/` in the build workspace, which git ignores; none are in the code. Everything here was set up on 4 November 2026.

## Supabase

- Project `punch-list` (`ulwewwyhestgxpxdiwme`), organization ross-built-platform, Canada Central.
- The database is the migrations in `supabase/migrations`, applied in order (see The live database in `phase-1.md`).
- Sign in is by email with a six digit code: the Magic Link and Confirm Sign Up templates carry the code (`{{ .Token }}`), subject "Your Ross Built sign in code" (to change to "Your Punch List sign in code" now that any company signs up), and the code length is 6.
- Anyone signs up (6 November, `many_companies` migration): after the code, someone new names their company and becomes its admin (`public.start_company`), then adds their people under People; someone an admin added goes straight in. `public.my_account` says where a signed-in email stands. Delete My Account (`public.delete_my_account`) takes the sign in away and the person's name, email and phone off their records; the last person at a company takes the whole company with it, photos included.
- The Before User Created hook still runs `public.hook_only_ross_built_people` (the name the Auth settings point at). It now lets anyone sign up, and turns away only someone switched off at their company: "That email is switched off at Ross Built. Ask an admin there to switch it back on."
- Email: Supabase's own sender only sends to the organization's team. jake@rossbuilt.com is invited to the team as a Developer, and with the invitation still open his codes already arrive (checked 5 November: a code reached his inbox in about a minute and a half). Keep the invitation; it may be what lets them through. Before anyone else signs in, the email needs its own sender (custom SMTP, for example Resend with a verified domain), set in Authentication, Emails, SMTP Settings.
- Checked end to end on 5 November: a code emailed to jake@rossbuilt.com signed him in, PowerSync accepted that sign in and finished the first sync (the `mine` and `ross_built` streams; only his own People row so far, since no jobs are loaded), and the test session was signed out.
- PowerSync's database role, `powersync_role`: can log in and replicate, reads past the access rules (PowerSync's sync config is the gate for the phones), and can only read the tables in `public`, which are exactly the tables in the `powersync` publication. It was made by hand, not in a migration. Its password was made in the build workspace and only its SCRAM hash was sent to the database. The password is `POWERSYNC_DATABASE_PASSWORD` in `local/secrets/powersync.env`.

## The company's page (6 November 2026)

- The page: `apps/company-page`, one small web page (about 33 KB, the script inside it), built by `node tools/build-company-page.mjs` into `apps/company-page/dist`. It is on Expo's hosting for the Punch List project: `https://punch-list.expo.app`, with each link at `https://punch-list.expo.app/c#<token>`. The token goes after the #, so the hosting never sees it. `https://punch-list.expo.app/c#sample` is the sample page, answered in the browser and sent nowhere; the preview's links all go there.
- To put a new version up, from `apps/mobile` with the Expo token from `local/secrets/expo.env` in the environment:

  ```
  node tools/build-company-page.mjs
  cd apps/mobile && npx eas-cli@latest deploy --export-dir ../company-page/dist --non-interactive --prod
  ```

- The function: `supabase/functions/company-page`, deployed with verify_jwt off (the link is the only key). Every call is a POST with the token in its body; it checks the link, answers through the `trade_*` database functions as the service role (nobody else can call them), and signs the photos for an hour. Supabase does not serve web pages from functions, which is why the page itself is on Expo's hosting.
- Later: the page can move to the company's own address (for example `link.rossbuilt.com`, or one for Punch List) by pointing a domain at Expo's hosting and setting `EXPO_PUBLIC_COMPANY_PAGE_URL` in the app's build.

## PowerSync

- Organization jakeross838, project Punch List, instance Production (United States): `https://6aeb7afcb0047aeb6df99617.powersync.journeyapps.com`.
- `powersync/service.yaml` is the instance: the database's direct connection as `powersync_role`, and sign in with Supabase Auth (`supabase: true`; PowerSync reads the project's signing keys itself). `powersync/sync-config.yaml` is what each phone receives. `powersync/cli.yaml` links the folder to the instance.
- The PowerSync access token is `PS_ADMIN_TOKEN` in `local/secrets/powersync.env`.
- To change the instance or the sync config, edit the files, then deploy with the PowerSync command line (version 0.10.3; on Node 22 it needs the flag shown):

  ```
  mkdir -p /tmp/pscli && (cd /tmp/pscli && npm install powersync@0.10.3)
  set -a && . local/secrets/powersync.env && set +a
  node --js-explicit-resource-management /tmp/pscli/node_modules/powersync/bin/run.js deploy
  node --js-explicit-resource-management /tmp/pscli/node_modules/powersync/bin/run.js status
  ```

- Checked: the connection test, the sync config check and the deploy pass; the first copy of the database is done and every synced table replicates; a request with no sign in is refused.
- Deployed again on 5 November for build 4, with the plans (`plan_sheets`) and the items' new columns: run from the repository root, since the command line looks for the `powersync` folder there. Supabase changes go in first, then the sync config, then the build, so a phone never asks for a table the database does not have yet.
- Deployed again on 6 November for build 5: the `company` stream (renamed from `ross_built`) also sends the signed-in person's company, from the new `orgs` table, after the `many_companies` migrations went in.

## Expo

- Account jakeross, project `@jakeross/punch-list` (`037db08a-8ab6-4f77-8840-8c82789b503b`).
- `apps/mobile/eas.json` has two build profiles: `production`, the TestFlight build, with build numbers kept by Expo, and `simulator`, which checks the iPhone build without Apple.
- The app's three public settings are Expo environment variables (production, preview and development): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_POWERSYNC_URL`. For local runs they are in `apps/mobile/.env`, which git ignores.
- The Expo access token is `EXPO_TOKEN` in `local/secrets/expo.env`.
- Builds start from GitHub. The build workspace cannot send the project to Expo (its network blocks the upload), so Expo takes the code from `github.com/jakeross838/punch-list` once the Expo GitHub app is installed on that repository and linked to the project, with `apps/mobile` as the base directory. Jake installed the Expo GitHub app on 5 November, and the project is linked to the repository with `/apps/mobile` as the base directory.
- First builds, 5 November: the simulator build and the production build (build 2) both finished from GitHub, in about 9 and 6 minutes.
- The iPhone project generates cleanly (`expo prebuild`) and has one PowerSync library requirement, `powersync-sqlite-core` 0.5. The app uses PowerSync's callback forms, so the async iterator polyfill PowerSync mentions for Expo is not needed.

## Apple and TestFlight

- Apple Developer Program: active since 2 November 2026, on Jake's Apple Account (jakeross838@gmail.com), as an individual. Team ID `HZVH9SG629`.
- Bundle identifier `com.rossbuilt.punchlist`, registered at Apple. The name on the iPhone is Punch List.
- App Store Connect record: Ross Built Punch List (Apple ID `6831305928`, SKU `rossbuilt-punchlist`), in `apps/mobile/eas.json` under `submit`.
- App Store Connect API key: Expo EAS Punch List, Admin. The key file, its key ID and the issuer ID are in `local/secrets/` (the `.p8` file and `apple.env`), never in the repo, which is public. Apple lets the key file be downloaded only once; the copy in `local/secrets/` and Jake's are the only ones.
- Signing: the distribution certificate and the App Store provisioning profile were made with `eas credentials` and the API key, and are kept by Expo. Both expire 5 November 2027.
- The app says it uses no encryption that needs an export declaration, so TestFlight builds do not stop on that question.
- TestFlight: the internal group Ross Built has every build, and Jake is in it. Apple invites the group when a processed build is ready.
- To ship a new build to TestFlight:
  1. Push to `main`, then on expo.dev, Builds, Build from GitHub: iOS, git ref `main`, profile `production`. Expo numbers the builds. A build takes about 5 to 10 minutes. The same can be started from the build workspace with Expo's API and `EXPO_TOKEN` from `local/secrets/expo.env`: the `githubApp { createGitHubBuild(buildInput: ...) }` mutation with the project's id, `gitRef: "main"`, `platform: IOS`, `buildProfile: "production"` and `baseDirectory: "apps/mobile"` (written without a leading slash: with one, the build cannot read `eas.json`; left out, the job looks for `eas.json` at the top of the repository). Build 4 was started this way on 5 November, and build 5 (the simple app, with sign up) on 6 November: about 6 minutes to build, 2 to upload and process. Build 6 (walk right away, managing jobs, the company's page) followed the same day, from commit beed1bd, and is in internal testing. Its two migrations (`walk_and_delete_job`, `company_page`) were held back by a safety check on applying them and still need to go in: until they do, Delete the Job, adding a company (Ross Built has no trades yet) and the company's page answers do not work.
  2. Download the build's .ipa (the build's Artifact link) into an empty folder and run `node tools/upload-testflight.mjs <ipa> <version> <build number>`. It uploads straight to App Store Connect with Apple's build upload API and the key in `local/secrets/`, in about 3 minutes, the same calls Expo's submit makes (build 3, 5 November).
  3. Apple processes the build (a few minutes) and TestFlight offers it to the Ross Built group by itself, with a notice to Jake.
  - The other way to upload is `npx eas-cli submit -p ios --id <build id> --non-interactive`, with the key added to the submit profile for that one run (`ascApiKeyPath`, `ascApiKeyId` and `ascApiKeyIssuerId` from `apple.env`) and `eas.json` put back as committed. It waits in Expo's free submission queue first (about 35 minutes on 5 November). The key cannot be stored on Expo for automatic uploads without signing in with the Apple ID's password, which is not done here.
- Expo's free plan queues builds and submissions; builds started within a minute on 5 November.
