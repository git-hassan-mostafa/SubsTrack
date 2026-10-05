# OTA update never arrives (fingerprint mismatch)

**Symptom:** `npm run ota-preview` / `npm run ota-prod` publishes fine per EAS, but the installed app never sees it.

**Cause:** `runtimeVersion` = `{ policy: "fingerprint" }`; phone accepts only an update whose runtime label matches its build's label **exactly**. Laptop computes a different fingerprint than the build → phone downloads nothing, no error, no warning.

Usual Windows reason = **line endings**: `eas.json` + `.gitignore` hashed **byte for byte**, so CRLF ≠ LF. (`app.json` + `package.json` hashed as parsed JSON → CRLF harmless.)

Confirmed, same commit + branch, only line endings differ:

|file state|platform|fingerprint|
|-|-|-|
|both LF|android|`a01ebec361f1c698653eb2475cc83840eb49ef89` ← the builds' runtime|
|`eas.json` CRLF|android|`3c28bbf166ff6934db1d651ba46c49af78bfc6da`|
|`.gitignore` CRLF|android|`78da758cce4ee64589ca2fec19cc943152d2ada0`|
|both CRLF|android|`1d23cca2549c65af385ad7a8d92210638a98f24b`|
|both LF|ios|`9c83feac01d2c82d0a59dd0228f99c26fd646751`|
|`eas.json` CRLF|ios|`0e60a0175c9810391802d8415942509398f6c4c2`|

`eas update` publishes **all platforms** by default → one publish can create two runtime rows (android + ios) in Expo dashboard.

## The fix — on the laptop publishing the wrong hash

Run inside `SubsTrack`. Pick block for your terminal (only the delete command differs).

**Git Bash:**

```bash
# 1. stop git from writing CRLF ever again on this machine
git config --global core.autocrlf input

# 2. force-rewrite the two byte-hashed files with LF endings
rm -f eas.json .gitignore
git checkout -- eas.json .gitignore

# 3. verify — BOTH lines must read  i/lf  w/lf
git ls-files --eol eas.json .gitignore

# 4. make node_modules identical to the other laptop's
npm ci

# 5. check the hash
npm run ota-fingerprint
```

**PowerShell** (`rm` = alias for `Remove-Item`, so `-f` is ambiguous; file names need a comma):

```powershell
git config --global core.autocrlf input
Remove-Item eas.json, .gitignore -Force
git checkout -- eas.json .gitignore
git ls-files --eol eas.json .gitignore
npm ci
npm run ota-fingerprint
```

Step 5 must print the runtime shown for your build in Expo dashboard (currently `a01ebec361f1c698653eb2475cc83840eb49ef89` for android). Then publish normally:

```bash
npm run ota-preview      # or: npm run ota-prod
```

### Why `rm` before `git checkout`?

Plain `git checkout -- eas.json` does nothing: git normalizes line endings when comparing, thinks file is correct, won't rewrite. Deleting first forces a fresh copy using `.gitattributes` rule (`* text=auto eol=lf`). `.gitattributes` applies only when git **writes** a file; a working tree already holding CRLF keeps it forever while `git status` shows clean — why this bug is so quiet.

### Repo-wide alternative

Normalize every tracked file, from repo root:

```bash
git rm --cached -r . -q
git reset --hard
```

Only with clean `git status` — uncommitted work is lost.

## If hash still wrong

Line endings aren't the only machine-dependent input. Ask EAS what differs:

```bash
npx eas fingerprint:compare --build-id <build id from the Expo dashboard>
```

Other cross-machine fingerprint changers:

- **`npm install` instead of `npm ci`** — caret ranges (`^15.0.3`) can resolve differently, hoisting can move packages; whole `android/` folders of autolinked native packages are hashed → different version = different hash. Always `npm ci`.
- **Different Node / npm major** — changes hoisting layout.
- **Different `@expo/fingerprint` version** — hashing algorithm itself.
- **`package.json` → `scripts`** — a fingerprint source; editing it invalidates every installed build. `scripts/print-fingerprint.js` is **not** a source — edit freely.

## Routine before every publish

```bash
git pull
git status                 # must be clean
npm ci
npm run ota-fingerprint    # must equal the build's runtime in the dashboard
npm run ota-prod
```

Fingerprint ≠ build's runtime → **do not publish**: fix the machine (above), or the change is genuinely native → rebuild + reinstall (`npm run build-preview` / `npm run build-prod`).

See also: gotchas #53 + #53b in `docs/gotchas.md`; release section in `CLAUDE.md`.
