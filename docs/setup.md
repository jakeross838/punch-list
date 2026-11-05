# Setup

How each service behind the app is set up, and where its secrets are kept. Secrets are kept only in `local/secrets/` in the build workspace, which git ignores; none are in the code. Everything here was set up on 4 November 2026.

## Supabase

- Project `punch-list` (`ulwewwyhestgxpxdiwme`), organization ross-built-platform, Canada Central.
- The database is the migrations in `supabase/migrations`, applied in order (see The live database in `phase-1.md`).
- Sign in is by email with a six digit code: the Magic Link and Confirm Sign Up templates carry the code (`{{ .Token }}`), subject "Your Ross Built sign in code", and the code length is 6.
- The Before User Created hook runs `public.hook_only_ross_built_people`. An email that is not an active person in People is turned away with "That email is not set up at Ross Built. Ask an admin to add you under People." before any account is made. Checked on the live project.
- Email: Supabase's own sender only sends to the organization's team. jake@rossbuilt.com is invited to the team as a Developer, and with the invitation still open his codes already arrive (checked 5 November: a code reached his inbox in about a minute and a half). Keep the invitation; it may be what lets them through. Before anyone else signs in, the email needs a Ross Built sender (custom SMTP, for example Resend with the rossbuilt.com domain).
- Checked end to end on 5 November: a code emailed to jake@rossbuilt.com signed him in, PowerSync accepted that sign in and finished the first sync (the `mine` and `ross_built` streams; only his own People row so far, since no jobs are loaded), and the test session was signed out.
- PowerSync's database role, `powersync_role`: can log in and replicate, reads past the access rules (PowerSync's sync config is the gate for the phones), and can only read the tables in `public`, which are exactly the tables in the `powersync` publication. It was made by hand, not in a migration. Its password was made in the build workspace and only its SCRAM hash was sent to the database. The password is `POWERSYNC_DATABASE_PASSWORD` in `local/secrets/powersync.env`.

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
- App Store Connect API key: Expo EAS Punch List, Admin, key ID `LU54LZZAX7`. The key file and the issuer ID are in `local/secrets/` (`AuthKey_LU54LZZAX7.p8`, `apple.env`). Apple lets the key file be downloaded only once; the copy in `local/secrets/` and Jake's are the only ones.
- Signing: the distribution certificate and the App Store provisioning profile were made with `eas credentials` and the API key, and are kept by Expo. Both expire 5 November 2027.
- The app says it uses no encryption that needs an export declaration, so TestFlight builds do not stop on that question.
- TestFlight: the internal group Ross Built has every build, and Jake is in it. Apple invites the group when a processed build is ready.
- To ship a new build to TestFlight:
  1. Push to `main`, then on expo.dev, Builds, Build from GitHub: iOS, git ref `main`, profile `production`. Expo numbers the builds.
  2. From the build workspace, with `EXPO_TOKEN` from `local/secrets/expo.env`, add the key to the submit profile for this one run (`ascApiKeyPath` `../../local/secrets/AuthKey_LU54LZZAX7.p8`, `ascApiKeyId`, `ascApiKeyIssuerId` from `apple.env`), run `npx eas-cli submit -p ios --id <build id> --non-interactive`, and put `eas.json` back as committed. The key cannot be stored on Expo for automatic uploads without signing in with the Apple ID's password, which is not done here.
  3. Apple processes the build (about 10 to 15 minutes) and TestFlight offers it to the Ross Built group.
- Expo's free plan queues builds and uploads; an upload waited about 40 minutes on 5 November.
