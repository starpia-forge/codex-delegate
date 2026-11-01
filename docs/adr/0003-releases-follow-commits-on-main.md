# Releases follow the commits on main

ADR 0002 kept the Release version in `package.json`, and a maintainer bumped it, committed and pushed a matching tag by hand. Releases now come from semantic-release: each push to `main` is read for Conventional Commits, and if it holds a `feat`, `fix` or breaking change, the workflow runs the tests, builds the pet, commits the new version to `main`, pushes the tag and creates the GitHub Release. Pushing to `main` is what publishes, so anything that needs checking by hand is checked on a branch first. This reverses ADR 0002's view that CI committing back was too much machinery for one maintainer. That rejection was about a hash pin that protected little; this commit replaces a whole manual procedure.

## Considered Options

- **Keep bumping by hand.** Nothing new to run, but versions and notes stay manual, and a merged change waits until someone cuts a Release.
- **release-please.** A release PR gives a review point, but merging it puts the version on `main` before the pet is built, so the version names a Release with no bundle for the length of the build. It also needs a merge for every Release.
- **semantic-release (chosen).** It builds before the version commit lands, so that gap is normally seconds. A version file can't be left out, because the installer reads `package.json` from the tag, so the release commit stays.

## Consequences

The version commit, the tag and the GitHub Release are separate steps and are not atomic. If publishing fails after the tag is pushed, a rerun finds nothing to release, and `main` names a version with no pet bundle until the Release is repaired by hand. A failure can also fall between the version commit and the tag. `docs/releasing.md` covers each state. Until the repair, installs with the pet stop with the missing-Release message and change nothing, as ADR 0002 describes.

The workflow does everything in one `windows-latest` job, because the pet must be built there and a second job would only add machinery. semantic-release doesn't test on Windows itself. A test or build failure leaves no commit, tag or Release.

Below 1.0 a breaking change bumps the minor version, because a commit marker shouldn't declare the project stable. Going to `1.0.0` is a deliberate decision.

A tag pushed by a person no longer releases anything. Rulesets stop force pushes to `main` and changes to `v*` tags, because version calculation depends on them; repository admins can bypass them to repair a failed Release.
