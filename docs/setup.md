# Setup

How each service behind the app is set up, and where its secrets are kept. Secrets are kept only in `local/secrets/` in the build workspace, which git ignores; none are in the code. Everything here was set up on 4 November 2026.

## Supabase

- Project `punch-list` (`ulwewwyhestgxpxdiwme`), organization ross-built-platform, Canada Central.
- The database is the migrations in `supabase/migrations`, applied in order (see The live database in `phase-1.md`).
- Sign in is by email with a six digit code: the Magic Link and Confirm Sign Up templates carry the code (`{{ .Token }}`), subject "Your Ross Built sign in code", and the code length is 6.
- The Before User Created hook runs `public.hook_only_ross_built_people`. An email that is not an active person in People is turned away with "That email is not set up at Ross Built. Ask an admin to add you under People." before any account is made. Checked on the live project.
- Email: Supabase's own sender only sends to the organization's team members. jake@rossbuilt.com is invited to the team as a Developer; once the invitation is accepted, his codes arrive. Before anyone else signs in, the email needs a Ross Built sender (custom SMTP, for example Resend with the rossbuilt.com domain).
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
- Builds start from GitHub. The build workspace cannot send the project to Expo (its network blocks the upload), so Expo takes the code from `github.com/jakeross838/punch-list` once the Expo GitHub app is connected to the project, with `apps/mobile` as the base directory.

## Apple and TestFlight

- Bundle identifier `com.rossbuilt.punchlist`. The name on the iPhone is Punch List; the App Store Connect record needs a name no other app uses, such as Ross Built Punch List.
- The app says it uses no encryption that needs an export declaration, so TestFlight builds do not stop on that question.
- What it takes, once App Store Connect is signed in:
  1. An App Store Connect API key with Admin access (Users and Access, Integrations, Team Keys). The key file goes in `local/secrets/`, with its key ID and the issuer ID.
  2. `eas credentials` with the key makes the distribution certificate and the provisioning profile, and stores the key with Expo for TestFlight uploads. Expo does not make the certificate without prompts, so this one is run interactively.
  3. The app record in App Store Connect, with the bundle identifier above.
  4. Build `production` from GitHub on expo.dev, then send it to TestFlight with `eas submit --platform ios`, and add Jake to internal testing.
