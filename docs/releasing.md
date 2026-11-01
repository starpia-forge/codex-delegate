# Releasing

A Release fixes the skills, installer and pet together under the version in
`package.json`. See [ADR 0002](adr/0002-pet-follows-the-release-version.md) and
[ADR 0003](adr/0003-releases-follow-commits-on-main.md).

## How a push becomes a Release

A push to `main` starts the **Release** workflow in
[`.github/workflows/release.yml`](../.github/workflows/release.yml). It runs one
`windows-latest` job with a 30-minute limit. Runs are queued one at a time.

With [`.releaserc.json`](../.releaserc.json), semantic-release reads the commits
since the last `v*` tag. If there is nothing releasable, the run stops with no
build. Otherwise it does these steps in order:

1. Set the next version in `package.json` and `package-lock.json`.
2. Run `scripts/release-build.ps1 X.Y.Z`. It runs the Node and Rust tests,
   generates third-party notices, builds the pet, checks the executable's
   ProductVersion and FileVersion, and packages the bundle into `dist/` with
   `scripts/pet-bundle.mjs`.
3. Push `chore(release): X.Y.Z` to `main`. If `main` moved on, the push is
   rejected and the run fails. It does not rebase untested commits. The queued
   run for the newer push releases instead.
4. Push tag `vX.Y.Z`.
5. Create the GitHub Release with notes grouped from the commits and the assets
   `codex-delegate-pet-windows-x64.zip` and
   `codex-delegate-pet-windows-x64.zip.sha256`.
6. Run `node scripts/pet-bundle.mjs --check-published X.Y.Z`. It downloads both
   files and checks that the zip matches its SHA-256.

The maintainer chooses what to push and when. Check anything manual on a branch
first. A tag pushed by hand releases nothing. The release commit starts no new
run, because pushes made with the repository token do not start workflows.

## Commit rules

A change to anything users receive is a `feat` or `fix`, even when the change
is to text such as a skill. The type determines whether it reaches a Release.

| Commit | Version change |
| --- | --- |
| `feat:` | Minor |
| `fix:` | Patch |
| Breaking: `feat!:`, `fix(scope)!:`, or a `BREAKING CHANGE:` footer | Minor while below 1.0 |
| `perf:` or a git-generated revert with subject `Revert "..."` | Patch |
| `docs:`, `refactor:`, `test:`, `ci:`, `chore:` | Nothing |

Merge commits use `merge:` so that a Release's notes do not list a change twice.
Several commits pushed together make one Release. An urgent fix is a normal
`fix:`.

## The missing-Release message

Installs from `main` with `--with-pet`, and plain user-scope `install` with the
pet enabled, stop when `package.json` on `main` names a version with no bundle.
They print:

```text
codex-delegate: Release vX.Y.Z has no pet bundle yet. The release workflow may still be running; retry later or install from a tagged Release.
Nothing was changed.
```

Skills, hooks and the existing pet stay unchanged. The window runs from the
version commit landing until the assets are published: normally seconds, and
until repaired after a failure.

## When a run fails

Recognise the state first, from any checkout at the repository root. `$version`
is the bare `X.Y.Z` version used throughout the repair:

```powershell
git fetch origin --tags
$version = (git show origin/main:package.json | ConvertFrom-Json).version
git ls-remote --exit-code --tags origin "refs/tags/v$version"
gh release view "v$version" --json isDraft,assets --jq '.isDraft, (.assets[].name)'
node scripts/pet-bundle.mjs --check-published $version
```

`git ls-remote --exit-code` prints nothing and exits 2 when the tag is missing.
`gh release view` prints `release not found` when there is no Release.
`--check-published` prints `Release vX.Y.Z passed (SHA-256 ...)` on success.
It downloads anonymously, so it only sees a published Release.

| State | What you see | Repair |
| --- | --- | --- |
| Tests or build failed | `$version` is the last Release and everything passes; the run's log shows the failure. No new commit, tag or Release exists. | Fix and push. Nothing landed. The same state results when the version commit was rejected because `main` moved on: the queued run releases and no repair is needed. |
| Version commit pushed, tag failed | The version commit is on `main`, but there is no tag. | Tag the version commit, then continue as the next state. |
| Tag pushed, no Release | The commit and tag exist; `gh release view` prints `release not found`. | Get the bundle, create the Release. |
| Release left as a draft | The commit, tag and draft exist; `isDraft` is `true`. | Get the bundle, upload both files, publish. |
| Release published, assets missing or wrong | The commit, tag and Release exist; `isDraft` is `false` and `--check-published` fails. | Get the bundle, upload both files, recheck. |

Once the version commit is on `main`, rerunning the failed workflow does not
help. A rerun checks out the older commit, so semantic-release sees `main`
ahead and skips.

Past the first state, repair before the next push to `main`. Without the tag, the next run works from
the previous tag and can arrive at this version again and tag a different
commit. With the tag but no Release, the next Release moves on and leaves this
one without a bundle.

### Tag the version commit

This is a repair step only. Find the version commit, because later commits may
sit on top:

```powershell
$commit = git log origin/main --format=%H --fixed-strings --grep "chore(release): $version" -1
git show --no-patch --format='%h %s' $commit
```

Confirm the printed subject is `chore(release): X.Y.Z` for `$version` before
tagging:

```powershell
git tag "v$version" $commit
git push origin "refs/tags/v$version"
```

Tag lightweight, as semantic-release does. The `Release tags` ruleset blocks
moving or deleting a `v*` tag once pushed, unless a repository admin bypasses
it; creating one is allowed. This tag releases nothing by itself.

### Get the bundle

Clear any older bundle from `dist/` first: `gh run download` refuses to
overwrite a file, and a stale file must not be uploaded.

Use the saved bundle from the failed run's `release-bundle` artifact first.
Find the run's ID in the list, then enter it at the prompt:

```powershell
gh run list --workflow release.yml --branch main --limit 5
$runId = Read-Host 'Failed run ID'
gh run download $runId --name release-bundle --dir dist
```

This puts both files directly in `dist/`. The artifact may be missing: the
upload tolerates an unbuilt bundle, and a lost runner cannot upload.

Or rebuild from the tagged commit. It needs Rust and takes several minutes,
as it also runs all tests. The script refuses a version that differs from the
checkout's `package.json`, which is why it runs on the tagged commit:

```powershell
$repair = Join-Path $env:TEMP "codex-delegate-repair-$version"
git worktree add --detach $repair "v$version"
Set-Location $repair
npm.cmd ci
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/release-build.ps1 $version
```

This leaves both files in that worktree's `dist/`. Run the next repair commands
from there. Afterwards leave it with `Set-Location` to your original checkout
and delete it with `git worktree remove --force $repair`.

Use the zip and `.sha256` file of one build together: a rebuilt zip has a
different hash from a saved one.

### Create the Release

When the tag exists but there is no Release:

```powershell
$previous = git describe --tags --abbrev=0 --match 'v*' "v$version^"
gh release create "v$version" dist/codex-delegate-pet-windows-x64.zip dist/codex-delegate-pet-windows-x64.zip.sha256 --verify-tag --title "v$version" --generate-notes --notes-start-tag $previous
```

`--verify-tag` matters: without it, `gh` would create a missing tag from the
default branch. `--notes-start-tag` keeps the notes from starting at an old
`pet-v*` Release. The notes come from GitHub, not from the commit groups; edit
them if they read poorly.

### Finish a draft

Upload both files, so the pair comes from one build, then publish:

```powershell
gh release upload "v$version" dist/codex-delegate-pet-windows-x64.zip dist/codex-delegate-pet-windows-x64.zip.sha256 --clobber
gh release edit "v$version" --draft=false
```

### Replace assets on a published Release

```powershell
gh release upload "v$version" dist/codex-delegate-pet-windows-x64.zip dist/codex-delegate-pet-windows-x64.zip.sha256 --clobber
```

`--clobber` deletes the old assets before uploading, so if an upload fails,
run it again.

### Finish every repair

```powershell
node scripts/pet-bundle.mjs --check-published $version
```

The repair is done when it prints `passed`. The failed run stays red; leave it.

## Optional: check an install in an isolated home

This is optional, for large changes. Run it after the Release is published.
On Windows with WebView2, open a new PowerShell terminal and install from
the tag into a fresh isolated home (replace `X.Y.Z`):

```powershell
$releaseTestHome = Join-Path $env:TEMP ("codex-delegate-release-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $releaseTestHome | Out-Null
$env:HOME = $releaseTestHome
$env:USERPROFILE = $releaseTestHome
$env:CLAUDE_CONFIG_DIR = Join-Path $releaseTestHome '.claude'
$env:CODEX_HOME = Join-Path $releaseTestHome '.codex'
npx github:starpia-forge/codex-delegate#vX.Y.Z install --with-pet
npx github:starpia-forge/codex-delegate#vX.Y.Z doctor
```

Use `npx.cmd` if PowerShell blocks `npx`. Confirm `doctor` reports the installed
bundle matches `X.Y.Z`. With the app running in that isolated home, confirm
`/health` reports `X.Y.Z` and the installed executable's FileVersion is
`X.Y.Z`. Other `doctor` checks need Codex installed and logged
in for the isolated home. Close the terminal after verification.
