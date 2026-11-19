# Build Checklist

Use this every time you make a new phone build. All commands run in `SubsTrack/` unless it says otherwise.

## Do I need a new build?

A new build is needed only when one of these changed:
- a new or upgraded native library, or an Expo / React Native upgrade
- app icon, splash screen, permissions, app name
- `SubsTrack/package.json` (its scripts too) or `eas.json`

Anything else (screens, logic, text, `Shared/`) → no build, just run `npm run ota-prod`.

## First build (only once)

1. [ ] Finish parts 1–3 of [production-setup.md](production-setup.md): accounts, database, EAS environment variables.
2. [ ] `cd tests && npm test` → all tests pass.
3. [ ] Commit everything. EAS builds from git, so changes that are not committed are not in the build.
4. [ ] Build: `npm run build-prod` (Google Play) or `npm run build-prod-apk` (APK file).
5. [ ] Back up the signing key: `eas credentials` → download the keystore.
6. [ ] SuperAdminWeb → Options → `AppDownloadUrl` = the Play page or the APK link.
7. [ ] Leave `MinClientVersion` empty. No old phones exist yet.

## Every later build

1. [ ] Raise `CLIENT_VERSION` by 1 in `Shared/src/modules/options/utils/clientVersion.ts`.
2. [ ] `cd tests && npm test` → all tests pass.
3. [ ] Database changed? Run `migration.sql` first (only if something new was added to it), then `script.sql`. If old phones would break with the new database, wait and run it at step 10.
4. [ ] `npm run deploy-all-functions` (safe to run every time).
5. [ ] Commit everything.
6. [ ] Build: `npm run build-prod` or `npm run build-prod-apk`.
7. [ ] Deploy the Web app. It reads `CLIENT_VERSION` too.
8. [ ] Wait until people can download the new build (Play approved, or APK uploaded).
9. [ ] SuperAdminWeb → Options: update `AppDownloadUrl` if the link changed, **then** set `MinClientVersion` = the new `CLIENT_VERSION`. Old phones now show "Update needed".
10. [ ] Database change that you held back at step 3 → run it now.

After this, `npm run ota-prod` sends updates to the new build as usual.

## Two rules

- Never set `MinClientVersion` higher than the `CLIENT_VERSION` inside the build people can install.
- Set `MinClientVersion` only after the new build can be downloaded.

## If something goes wrong

| Problem | Fix |
|-|-|
| Every phone shows "Update needed", even the new build | `MinClientVersion` is too high. Lower it in SuperAdminWeb. Works right away. |
| An OTA update never arrives | The phone has an older build. See [docs/ota-fingerprint-mismatch.md](docs/ota-fingerprint-mismatch.md). |
| The app closes right after it opens | EAS environment variables are missing (EAS → Environment variables → production). |
