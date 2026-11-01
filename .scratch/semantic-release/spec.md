# Spec: Releases follow the commits on main

Status: ready-for-agent

## Problem Statement

Cutting a **Release** takes a maintainer: decide the version, bump `package.json`, commit, tag, push both together, wait for the workflow. Nothing prompts it, so merged work simply waits. The tray Quit reached `main`, but users still get `0.4.0`, because nobody cut a Release. The version number is a judgement made at the end from memory, though every commit already says whether it is a feature or a fix. And the steps have to be done just so: a tag that doesn't match `package.json` fails, and pushing them separately widens the time when installs from `main` stop with the missing-Release message.

## Solution

Pushing to `main` releases. A workflow reads the Conventional Commits since the last Release. If there is nothing to release, it does nothing. Otherwise it works out the next version, tests and builds everything, commits the version to `main`, tags it, and creates the GitHub Release with the pet bundle, its `.sha256` file and notes made from the commits. It then checks the published Release.

A maintainer no longer chooses versions or runs release steps. They choose what to push, and they name commits honestly (ADR 0003). The next Release after this ships is `v0.5.0`, carrying the tray Quit.

## User Stories

### Releasing

1. As a maintainer, I want a push to `main` that contains a `feat` or `fix` to produce a Release, so that finished work reaches users without a separate step.
2. As a maintainer, I want a push with nothing releasable to do nothing, so that documentation and refactoring don't publish a version.
3. As a maintainer, I want several commits pushed together to produce one Release, so that I control how work is grouped.
4. As a maintainer, I want the next version worked out from the commits, so that I never choose it by hand.
5. As a maintainer, I want `feat` to bump the minor version and `fix` the patch version, so that the version says what changed.
6. As a maintainer, I want a breaking change to bump the minor version below 1.0, so that one commit marker can't declare the project stable.
7. As a maintainer, I want `feat!:` and `fix(scope)!:` recognised as breaking, so that the marker this repository uses counts.
8. As a maintainer, I want commits since `v0.4.0` to count and the old `pet-v*` tags to be ignored, so that the first automatic Release is `v0.5.0`.
9. As a maintainer, I want a tag pushed by hand to release nothing, so that there is one way to publish.
10. As a maintainer, I want an urgent fix to go through the same path as a `fix:` commit, so that there is no second procedure to remember.
11. As a maintainer, I want two pushes close together to be handled one at a time, so that two Releases never race.
12. As a maintainer, I want a Release run that can't push its version commit because `main` moved on to fail without rebasing, so that only tested commits are released, and the newer push's run releases instead.

### What a Release contains

13. As a user, I want every Release to be tested and built before its version reaches `main`, so that a failed build never advertises a version.
14. As a user, I want the tagged commit's `package.json` and `package-lock.json` to carry the Release version, so that an install from the tag finds its own pet bundle.
15. As a user, I want the pet app, `/health` and the executable's metadata to report the Release version, so that nothing disagrees, as today.
16. As a user, I want each Release to have the pet bundle and its `.sha256` file, so that `install --with-pet` works from it.
17. As a user, I want Release notes grouped from the commits, so that I can see what changed.
18. As a user, I want `pet-v*` Releases left alone, so that old links keep working.
19. As a user, I want installing the pet from `main` to keep working around a Release, apart from a few seconds, so that automation doesn't make `main` less reliable.

### When something fails

20. As a maintainer, I want a failure in tests or the build to leave no commit, tag or Release, so that retrying is just fixing and pushing.
21. As a maintainer, I want a failed run to keep the bundle it built when it can, and a way to rebuild it from the commit when it can't, so that a Release can always be repaired.
22. As a maintainer, I want a documented way to finish a Release from whichever state a failure left, so that a rerun that finds nothing to release doesn't leave me stuck.
23. As a maintainer, I want the published Release checked for both files and a matching hash, so that a bad Release shows up as a failed run, not as a user's error.
24. As a maintainer, I want a failed run not to open GitHub issues or comment on anything, so that the tool stays quiet beyond the normal failure notice.
25. As a maintainer, I want the release job to stop after a bounded time, so that a hung test can't hold a runner for six hours again.

### Repository and rules

26. As a maintainer, I want the release workflow to need only the repository's own token, so that there is no long-lived secret to manage.
27. As a maintainer, I want the version commit not to start another release run, so that a Release can't loop.
28. As a maintainer, I want force pushes to `main` and changes to `v*` tags blocked, so that version calculation can't be undermined. (Applied on GitHub: rulesets `main history` and `Release tags`.)
29. As a contributor, I want the rule that shipped changes use `feat` or `fix` written down, so that a change doesn't silently miss a Release.
30. As a contributor, I want the rule that merge commits use `merge:` written down, so that Release notes don't list a change twice.
31. As a user reading the README, I want the pinned-install example to show `#vX.Y.Z`, so that it never names an old version.
32. As a maintainer, I want one release procedure in `docs/releasing.md`, so that I don't follow outdated manual steps.
33. As a user, I want `npx github:` installs not to download development tooling, so that installing stays small and fast.
34. As a maintainer, I want the isolated-home install check kept as an optional procedure, so that I can use it for large changes.

## Implementation Decisions

- **Decisions recorded in ADR 0003**, which supersedes how ADR 0002 cuts a Release. ADR 0002's rule stands: `package.json` is the only version, and the pet has none of its own. The `release-version` spec's "Automating the version bump" out-of-scope entry gets a superseded note pointing here.

### Workflow

- The existing release workflow becomes the only one. It triggers on pushes to `main`, and the `v*` tag trigger is removed. It runs one `windows-latest` job with a 30-minute limit, serialised by a concurrency group that queues rather than cancels, because a cancelled run could stop between pushing the tag and publishing.
- Permissions stay `contents: write`, using the repository token. Checkout fetches full history and tags without persisting credentials.
- Node is pinned to a major that semantic-release supports. Release tooling and the existing pet generator are installed from the lockfile without running install scripts.
- The workflow runs semantic-release, and every release step happens inside it, so a run with nothing to release does no build work.
- If the job doesn't succeed, including a timeout, the bundle output is uploaded as a workflow artifact. The step tolerates a missing bundle, since an earlier failure may not have built one. Runner loss can still prevent the upload, so repair doesn't depend on it (see Failure states).
- A run's freshness is decided when its version commit is pushed. If `main` has moved on, that push is rejected and the run fails with no tag; nothing is rebased, because the moved commits weren't tested. The queued run for the newer push then releases. A push to `main` in the seconds after the version commit lands can leave "Tag pushed, no Release": semantic-release pushes the tag and branch together, not atomically, so the tag lands, the branch push is rejected and the run fails before publishing.

### semantic-release configuration

- Committed configuration, for the `main` branch, with the default `v${version}` tag format. Plugins, in order:
  1. Commit analysis with the `conventionalcommits` preset, and a release rule mapping breaking changes to `minor`.
  2. Notes generation with the same preset.
  3. The npm plugin with publishing disabled, to set the version in `package.json` and `package-lock.json`.
  4. A build step (the exec plugin) that runs the release build with the next version.
  5. The git plugin, committing only `package.json` and `package-lock.json` as `chore(release): X.Y.Z`, the existing message.
  6. The GitHub plugin, publishing the zip and `.sha256` file, with issue comments, labels and failure issues turned off.
  7. A success step that runs the published-Release check.
- The order is a decision: the build runs after the version is set, because the pet takes its version from `package.json`, and before the git plugin, so a test or build failure lands nothing. The git plugin pushes the version commit during prepare; the tag follows afterwards, so a failure between them is possible (see Failure states).
- No `[skip ci]` marker: pushes made with the repository token don't start workflows.
- Once `1.0.0` is deliberately cut, the breaking rule is removed. That is a future change, not automated.
- semantic-release and its plugins are `devDependencies`, pinned through the lockfile. `package.json`'s `files` list keeps release configuration out of the package.
- npm installs a Git dependency's `devDependencies` when the package has a `build` script, not only `prepare`. The existing `build` script, which rebuilds the skills from upstream, is renamed so that it isn't a lifecycle name, and the pet README follows. This also stops `sharp` being downloaded on every install today. No script named `build`, `prepare`, `prepack`, `preinstall`, `install` or `postinstall` remains.

### Release build

- The steps now in the workflow move into one release script that takes the version and stops at the first failure: drop the GitHub tokens, check the checkout's version against the supplied version, run Node tests, Rust tests, install `cargo-about`, generate notices, build the pet, check the executable's product and file versions against `package.json`, package the bundle with `--expect-tag v<version>`.
- It is a script, not workflow steps, because it has to run from within semantic-release. It uses the runner's PowerShell, as the workflow steps do today.
- The tag check at the head of the old workflow goes away: the version now comes from the tool. `--expect-tag` stays as the packaging guard.

### Failure states

Each is documented in `docs/releasing.md`. Past the first state they are finished by hand from the saved bundle, or from one rebuilt by running the release script on the tagged commit.

| State | What exists | Repair |
| --- | --- | --- |
| Tests or build failed | Nothing | Fix and push |
| Version commit pushed, tag failed | Commit on `main`, no tag | Tag that commit by hand and continue below. A rerun can't help: it checks out the older commit, so semantic-release sees `main` ahead and skips |
| Tag pushed, no Release | Commit and tag | `gh release create` from the tag, with both assets |
| Release left as a draft | Commit, tag, draft | Upload what's missing, publish the draft |
| Release published, assets missing or wrong | Commit, tag, Release | Replace the assets, rerun the published-Release check against the tag |

### Published-Release check

- The bundle script gains a mode separate from its local `--check`. Given an explicit version, which may differ from the checkout's `package.json`, it downloads the Release's `.sha256` file and zip through the same base-URL override the installer uses, and fails unless the checksum line is valid and matches the zip. It uses the format the installer accepts, so the two can't drift.
- It runs as the final step of a Release. A failure can't undo anything; it turns the run red.

### Documentation

- `docs/releasing.md` is rewritten around: how a push becomes a Release; the commit rules; how to tell which failure state a run left and repair it; and the optional isolated-home install check.
- It keeps the explanation of the missing-Release message. That window is now normally seconds, and lasts until repaired after a failure.
- `AGENTS.md` commit guidelines gain the two rules: a change to anything users receive is a `feat` or `fix`, and merge commits use `merge:`.
- Both READMEs' pinned-install example becomes `#vX.Y.Z`.

### Unchanged

- The installer, `doctor`, `list`, the pet app and the version flow from `package.json` into the build. Tags stay `vX.Y.Z`, and the assets keep their names.

## Testing Decisions

- Good tests check external behaviour at the highest seam: which version a set of commits produces, and what a check does against a fake Release. They don't inspect the configuration's shape or the workflow's text.
- **Release rules**: a Node test loads the repository's committed configuration and passes it to the commit analyzer with real commit messages, as a table:
  - `feat` gives minor, `fix` gives patch.
  - `perf:` and a git-generated `Revert "..."` give patch.
  - `feat!:`, `fix(scope)!:` and a `BREAKING CHANGE:` footer give minor.
  - `docs`, `refactor`, `test`, `chore(release):` and `ci` give nothing.
  - `merge:` and a default `Merge branch` subject give nothing.
- **Published-Release check**: run the bundle script as a process against the existing fake-Release helper. It passes on a good Release, and fails on a missing zip, a missing `.sha256` file, a malformed line and a mismatched hash. Prior art: the bundle script test and the fake-Release helper.
- **Release script**: not tested on its own. It runs in the workflow, and its steps are checks already.
- **Package contents**: the existing packaged-install smoke test keeps asserting what ships; it gains an assertion that release configuration and the release script aren't in the package. It also asserts that `package.json` has no lifecycle script that makes npm install `devDependencies` for a Git install, since `npm pack` can't show that.
- **Not automated**: the workflow itself. It is accepted by the real `v0.5.0` Release:
  - the first push to `main` creates `chore(release): 0.5.0`, tag `v0.5.0` and the Release with both assets, because commits since `v0.4.0` include `feat`, even if that push adds only `ci` or `docs` commits;
  - after that, a push of only `docs` commits releases nothing;
  - with a clean npm cache, `npx github:starpia-forge/codex-delegate#v0.5.0 list` doesn't install `sharp` or semantic-release;
  - the Release's notes list the commits since `v0.4.0`, with no change listed twice from a merge commit that is already in history (the tray Quit merge commit predates the rule and may appear);
  - `npx github:starpia-forge/codex-delegate#v0.5.0 install --with-pet` passes `doctor` in an isolated home, `/health` and the executable report `0.5.0`.
- `npm test` passes locally and within the job.

## Out of Scope

- Publishing to npm.
- A release PR or any human approval step before publishing.
- A second workflow for repairing a failed Release.
- Adding a CI run for pushes that don't release, or for branches.
- Required checks or pull requests on `main`.
- A `CHANGELOG.md` file.
- Pre-release channels and maintenance branches.
- Changing the installer's handling of a missing Release to close the window completely.
- Enforcing commit messages with a hook or commit linter.
- Cutting `1.0.0`.

## Further Notes

- GitHub settings are already done: `main history` blocks deletion and force pushes on the default branch, and `Release tags` blocks deletion and updates of `v*` tags. Repository admins can bypass both. Neither requires pull requests or checks, so normal pushes and the workflow's push are allowed. The workflow's actual push is first exercised by `v0.5.0`.
- The `v0.4.0` tag is reachable from `main`, and commits since then include `feat`, so the first Release is `v0.5.0`.
- semantic-release doesn't test on Windows itself. The first run is the real check. If the Windows path proves unworkable, the fallback is to run semantic-release on Ubuntu with the bundle built in a separate Windows job.
- Follow-up, not part of this work: npm v12's documentation says `allow-git` defaults to `none`. If that blocks `npx github:` specs, the install command in the READMEs breaks for npm v12 users. It hasn't been verified against a real npm v12.
- Suggested order: release rules and configuration; published-Release check; workflow and release script; docs; acceptance through `v0.5.0`.
