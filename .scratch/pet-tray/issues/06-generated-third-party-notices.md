# 06: Generated third-party notices in the bundle

**What to build:** Every pet release carries a complete, generated notices document. It holds codex-delegate's MIT licence, the fan-art notice, and the licence texts with copyright lines of every compiled Rust crate whose licence requires a notice in binary form. The release workflow generates the document from the locked dependency set, embeds it in the app and ships it as `THIRD-PARTY-NOTICES` in the bundle. A crate the generator can't classify, or whose required attribution is missing, fails the release.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Spec: `.scratch/pet-tray/spec.md` (Licence notices)

- [ ] A committed `cargo-about` configuration:
  - Targets only `x86_64-pc-windows-msvc` and ignores build and dev dependencies.
  - Has an ordered `accepted` list with the notice-free licences first.
  - Has a place for reviewed clarifications bound to a crate version.
- [ ] The release workflow installs a pinned `cargo-about` version and runs it with `--locked --fail`.
- [ ] A Node notice generator turns `cargo-about`'s JSON into the notices document:
  - It includes and excludes crates by the spec's licence classification. `BSL-1.0` is notice-free.
  - It keeps every component of an `AND` expression and honours the selected alternative of an `OR` expression.
  - It groups identical licence texts and keeps copyright lines.
  - It carries Apache `NOTICE` content.
  - It adds the project licence and the fan-art notice.
  - It fails, naming the crate, on an unknown licence or missing required text or attribution. It never substitutes generic text.
  - Its output is deterministic.
- [ ] The bundle packager takes the notices document as an explicit input, ships it byte for byte as `THIRD-PARTY-NOTICES`, and refuses a missing input or the development stub before writing anything.
- [ ] Every packager caller passes fixture notices, including the bundle test and the packed-package smoke test. The smoke test checks the bytes survive installation.
- [ ] The release workflow generates the notices once, before `cargo build`. It places that file in the UI assets for embedding and hands the same file to the packager. The generated file is ignored by git. A development build embeds a stub carrying a stub marker.
- [ ] Generator fixture tests cover the following cases:
  - Inclusion and exclusion.
  - A compound `AND` licence.
  - A selected `OR` alternative.
  - Grouping identical texts, while keeping distinct `NOTICE` contents apart under otherwise identical licence text.
  - Copyright lines kept.
  - Failure on an unknown licence.
  - Failure on missing attribution.
  - Deterministic output.
- [ ] A local run of the release steps against the real lockfile succeeds.
- [ ] The full Node test suite passes.
