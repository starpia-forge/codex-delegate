# Releasing

A Release fixes the skills, installer and pet together under the version in
`package.json`. See [ADR 0002](adr/0002-pet-follows-the-release-version.md).

1. Bump `package.json` to `X.Y.Z` and commit as `chore(release): X.Y.Z`.
2. Tag that commit and push the commit and tag together (replace `X.Y.Z` and
   `<branch>`):

   ```powershell
   git tag vX.Y.Z
   git push --atomic origin <branch> refs/tags/vX.Y.Z
   ```

3. Wait for the **Release** workflow to finish. It checks the tag against
   `package.json`, runs the Node and Rust tests, generates notices, builds the
   pet and checks its executable version. It then creates Release `vX.Y.Z` with
   generated notes, `codex-delegate-pet-windows-x64.zip` and its `.sha256` file.
   No follow-up pin commit is needed.
4. On Windows with WebView2, open a new PowerShell terminal and install from
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

   Use `npx.cmd` if PowerShell blocks `npx`. Confirm the Release has both assets,
   the downloaded zip matches its `.sha256`, and `doctor` reports the installed
   bundle matches `X.Y.Z`. With the app running in that isolated home, confirm
   `/health` reports `X.Y.Z` and the installed executable's FileVersion is
   `X.Y.Z` (or `X.Y.Z.0`). Other `doctor` checks need Codex installed and logged
   in for the isolated home. Close the terminal after verification.

From the version bump until the workflow publishes the assets, installs from
`main` with `--with-pet`, and plain user-scope `install` with the pet enabled,
stop with the missing-Release message and "Nothing was changed". Skills, hooks
and the existing pet stay unchanged. Push the commit and tag together to keep
this window short; retry after the workflow finishes or install from an
existing Release tag.
