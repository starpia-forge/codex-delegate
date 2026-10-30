# 02: The pet app reports the package version in every build

**What to build:** Every build of the **pet** app, local or CI, takes its version from the repository's `package.json`. `/health`, the tray and the executable's version metadata always agree with the **Release** version. The `CODEX_DELEGATE_PET_VERSION` override and the fallback to the Rust crate's own version are removed, so a local build can no longer report `0.1.0`. See spec "App version, single source" and ADR 0002.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The Tauri config takes its version from `package.json`, if Tauri 2 supports a `package.json` path there; this is checked and the result recorded in `## Comments`. The Rust side reads `package.json` through the build script. If Tauri can't read the path, the build script supplies the version to both.
- [ ] The build script declares `package.json` as a rerun trigger. Two successive builds that differ only in the `package.json` version, without cleaning the target directory, each report their own version in `/health` and in the executable's file version.
- [ ] The Rust `/health` version test compares against the `package.json` version, with no environment override, and `cargo test` passes.
- [ ] No references to `CODEX_DELEGATE_PET_VERSION` remain in code, tests or docs. The workflow still sets it until ticket 04 replaces that step, and setting it is now harmless.

## Comments
