# 08: Pet release and acceptance

**What to build:** A pet release built from the finished feature by the release workflow, pinned, and installed from the real GitHub Release. It passes the manual checks of tickets 02, 03, 05 and 07 on Windows 10 against that exact bundle.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07

**Status:** ready-for-human

Spec: `.scratch/pet-tray/spec.md` (Testing Decisions: Not automated)

- [x] A pet release is cut by the workflow, with real generated notices and no stub, and the pin is bumped to it.
- [x] Installed from the real release into the user's home, `doctor` is clean.
- [x] The bundle contains `THIRD-PARTY-NOTICES`, and the licences window shows the same notices.
- [ ] Every manual check from tickets 02, 03, 05 and 07 has been run against this bundle and recorded in the comments, with any failure filed as a follow-up.
- [x] `install --without-pet` then leaves no pet files, no pet hooks and no preferences file.

## Comments

- 2026-10-29: Local pre-release acceptance on Windows 10 19045 (primary 2560×1440 at 100 %, second monitor), with a `pet-v0.2.0` bundle built by the release steps locally (real `cargo-about` notices, no stub) and installed through the real installer into an isolated home on port 47811 (the user's 0.1.2 app kept running on 47800). Tray and windows were driven with FlaUI; window styles, z-order and capture affinity were read through Win32.
  - Pass: `THIRD-PARTY-NOTICES` in the bundle is byte-identical to the generated notices; `doctor` pet checks all OK; update keeps `pet-preferences.json` byte for byte; `install --without-pet` leaves no bundle, state, preferences or pet hooks and stops the app.
  - Pass: tray icon with tooltip `codex-delegate pet 0.2.0` (lives in the overflow area); left-click toggles; `{"hidden":true}` written without a `language` key; `list` shows `, hidden`, `doctor` prints the OK-level line; `/quit` removes the tray icon; a relaunch while hidden keeps the tray and never shows the strip; Show pets re-applies click-through and topmost.
  - Pass: menu starts in Korean under a Korean Windows display language (`펫 표시` / `라이선스` / `언어: 한국어`); a switch relabels the menu and an open licences window live and stores `"language":"en"`.
  - Pass: licences window opens from the tray without hanging, stays a single window on a second click, has a taskbar entry, shows the MIT licence, the fan-art notice and the crate notices, reopens in the current language, stays open while pets are hidden; the strip keeps click-through and topmost while it is open.
  - Pass: the five characters on their slots (lico checked through a `tester` role mapped to the computer-user art), animating; leader `waiting`, `review` and `failed` poses; capture affinity 0x11 while a computer-user worker is live and 0x0 after it ends.
  - Pass: a cold start during a borderless fullscreen window keeps the strip behind it with topmost dropped.
  - **Failed, fixed:** after that fullscreen window closed, the strip never regained topmost: `SetWindowPos(HWND_TOPMOST)` returned Ok without applying, and later attempts were refused too. Fixed in 3dc6111 (NOTOPMOST→TOPMOST fallback, watcher self-heal) and b292646 (refusal never blocks showing, fallback tested through a seam). Rechecked: restored within about a second in 8 of 9 cold-start runs; one run right after a reinstall stayed non-topmost and could not be reproduced afterwards.
  - Observed, not filed yet: relaunching the app within about 3 s of `/quit` can panic at startup with WebView2 `0x800700AA` (resource in use) while the previous instance's WebView2 is still shutting down.
  - Not run: idle exit after 10 minutes (exit path shared with `/quit`, which passed); a Korean→English Windows display language change; a DPI scale other than 100 %; Windows 11.
  - Still to do: push `feat/pet-tray` and tag `pet-v0.2.0`, verify the workflow release, bump the pin, install from the real release.
- 2026-10-29: Release on hold while the maintainer finishes the artwork in parallel (the source sheets under `pet/art/machikado-mazoku/` are being replaced; `mikan.png` already changed in the working tree, uncommitted). When the artwork is final: commit the source sheets, rerun the default pet generator, verify the five packages and rebuild the bundle, then continue with the steps above.
- 2026-10-29: Final artwork committed by the maintainer (8b6f7b1, e10a0d7, 79785ed); default pet packages regenerated (96163dc), 379 JS and 28 Rust tests pass, a local bundle installed into the isolated home showed the new art. `feat/pet-tray` and `pet-v0.2.0` pushed; the Pet release workflow (run 40884527273) published `codex-delegate-pet-windows-x64.zip` with sha256 `0bff7810…2bf2` matching its `.sha256` asset. The released `THIRD-PARTY-NOTICES` is byte-identical to the locally generated notices (no stub) and the five sprite sheets are identical to the committed packages. Pin bumped (78728e3). Installed from the real release into the maintainer's home: installed exe and notices match the release, `doctor` pet checks all OK.
  - Remaining for this ticket: the manual checks above were run against a locally built bundle from the same sources, not the released zip, and the "Not run" items are still open.
