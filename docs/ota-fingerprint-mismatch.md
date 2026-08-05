# Fixing an OTA update that never arrives (fingerprint mismatch)

**Symptom:** you run `npm run ota-preview` / `npm run ota-prod`, EAS says the update
published fine, but the installed app on the phone never sees it.

**Cause:** `runtimeVersion` uses `{ policy: "fingerprint" }`. A phone only accepts an
update whose runtime label matches the label of the build it was installed from,
**exactly**. If your laptop computes a different fingerprint than the one the build was
made with, the phone correctly downloads nothing — no error, no warning.

The usual reason on Windows is **line endings**. `eas.json` and `.gitignore` are hashed
**byte for byte**, so a CRLF copy hashes differently than an LF copy. (`app.json` and
`package.json` are hashed as parsed JSON, so CRLF is harmless there.)

Confirmed example from this project — same commit, same branch, only line endings differ:

| file state              | platform | fingerprint                                |
| ----------------------- | -------- | ------------------------------------------ |
| both LF                 | android  | `a01ebec361f1c698653eb2475cc83840eb49ef89` ← the builds' runtime |
| `eas.json` CRLF         | android  | `3c28bbf166ff6934db1d651ba46c49af78bfc6da` |
| `.gitignore` CRLF       | android  | `78da758cce4ee64589ca2fec19cc943152d2ada0` |
| both CRLF               | android  | `1d23cca2549c65af385ad7a8d92210638a98f24b` |
| both LF                 | ios      | `9c83feac01d2c82d0a59dd0228f99c26fd646751` |
| `eas.json` CRLF         | ios      | `0e60a0175c9810391802d8415942509398f6c4c2` |

> `eas update` publishes **all platforms** by default, which is why one publish can create
> two runtime rows (android + ios) in the Expo dashboard.

---

## The fix — run this on the laptop that publishes the wrong hash

Run it inside the `SubsTrack` folder. Pick the block that matches your terminal — the
only difference is the delete command.

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

**PowerShell** (`rm` is an alias for `Remove-Item`, so `-f` is ambiguous and the file
names need a comma):

```powershell
git config --global core.autocrlf input
Remove-Item eas.json, .gitignore -Force
git checkout -- eas.json .gitignore
git ls-files --eol eas.json .gitignore
npm ci
npm run ota-fingerprint
```

Step 5 must print the runtime shown for your build in the Expo dashboard (currently
`a01ebec361f1c698653eb2475cc83840eb49ef89` for android).

Then publish normally:

```bash
npm run ota-preview      # or: npm run ota-prod
```

### Why `rm` before `git checkout`?

A plain `git checkout -- eas.json` does nothing: git normalizes line endings when it
compares, so it thinks the file is already correct and refuses to rewrite it. Deleting it
first forces git to write a fresh copy using the `.gitattributes` rule
(`* text=auto eol=lf`).

`.gitattributes` only applies when git **writes** a file. A working tree that already has
CRLF keeps it forever, and `git status` still shows clean — that is what makes this bug so
quiet.

### Repo-wide alternative

To normalize every tracked file at once, from the repo root:

```bash
git rm --cached -r . -q
git reset --hard
```

Only do this with a clean `git status` — uncommitted work would be lost.

---

## If the hash is still wrong after all that

Line endings are not the only machine-dependent input. Ask EAS what actually differs:

```bash
npx eas fingerprint:compare --build-id <build id from the Expo dashboard>
```

Other things that change the fingerprint between machines:

- **`npm install` instead of `npm ci`** — caret ranges (`^15.0.3`) can resolve to different
  versions, and hoisting can move packages. Whole `android/` folders of autolinked native
  packages are hashed, so a different version = a different hash. Always `npm ci`.
- **Different Node / npm major version** — changes hoisting layout.
- **Different `@expo/fingerprint` version** — the hashing algorithm itself.
- **`package.json` → `scripts`** — the scripts block is a fingerprint source. Editing it
  invalidates every installed build. `scripts/print-fingerprint.js` itself is **not** a
  source, so that file can be edited freely.

---

## Routine before every publish

```bash
git pull
git status                 # must be clean
npm ci
npm run ota-fingerprint    # must equal the build's runtime in the dashboard
npm run ota-prod
```

If the fingerprint does not match the build's runtime, **do not publish** — either fix the
machine (above) or the change is genuinely native and needs a rebuild + reinstall
(`npm run build-preview` / `npm run build-prod`).

See also: gotchas #53 and #53b in [gotchas.md](gotchas.md), and the release section in
[../CLAUDE.md](../CLAUDE.md).
