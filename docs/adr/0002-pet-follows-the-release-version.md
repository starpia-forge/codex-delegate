# The pet follows the release version

The pet app used to be released on its own `pet-v*` tags, and a committed `pet-pin.json` named the bundle and its SHA-256 for the installer. That meant two version lines and a pin commit after every pet release, and the pin pointed at a bundle that no `v*` release had ever shipped. The pet now has no version of its own: a `vX.Y.Z` tag builds the pet and attaches the bundle to the `vX.Y.Z` GitHub Release, and the installer downloads the bundle for its own `package.json` version.

## Considered Options

- **Keep a committed SHA-256 pin.** A tagged commit cannot contain the hash of a bundle built from it, so CI would have to commit the pin and tag that commit itself. Rejected as too much release machinery for one maintainer.
- **Verify against the release's `.sha256` file (chosen).** The hash comes from the same GitHub Release as the bundle, so it catches corrupt or truncated downloads but not an asset replaced on the release afterwards. Both files are under the maintainer's control, so the committed pin protected little more.

## Consequences

Installing from `main` needs a Release for the version in `package.json`. The window runs from the version bump until the release workflow finishes. During it, `install --with-pet` from `main` fails with a clear "no pet bundle for this version" error. So does a plain `install` for users who have the pet enabled, and nothing is changed, so that skills, installer and pet always move to a new Release together. The version commit and the tag are pushed together to keep that window short.

The release workflow refuses a tag that doesn't match `package.json` before it runs anything else. The pet app, its `/health` version and its executable metadata all read their version from `package.json` at build time, so there is no pet version left to drift.
