# 16: Final release acceptance

**What to build:** A pet release built from the finished feature, installed with `install --with-pet` from the real GitHub Release, passes the spec's full manual checklist on Windows 10 (and Windows 11 if available) against that exact bundle, and the package pin points to it. Doesn't wait for the default artwork (15); a later release carries it.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Testing: Not automated)

- [x] Pet release cut by the workflow from the branch containing tickets 02 to 14; pin bumped to it.
- [x] Installed from the real release into the user's home; `doctor` clean.
- [ ] Every item of the spec's manual checklist run against that bundle and recorded in this ticket's comments, with any failure filed as a follow-up.
- [x] `install --without-pet` then leaves no pet files and no pet hooks.

## Comments

- 2026-10-29: `pet-v0.1.0` cut from `feat/pet` and pinned (407bf0b). Checked from the real release in an isolated home: install, `doctor` pet checks all OK, `/health` reports 0.1.0, and `--without-pet` leaves no pet files or hooks. That run found removal right after the app stopped failing with EPERM while WebView2 still held the bundle; fixed in 7f280aa and rechecked (removal twice, plus an update with the app running). Still to do: install into the user's own home, then the full manual checklist.
- 2026-10-29: Manual checklist run on Windows 10 19045 (primary 2560×1440 at 100 %, second monitor portrait). `pet-v0.1.0` installed into the user's home, `doctor` all OK. Pet state was read through WebView2 remote debugging; capture affinity through `GetWindowDisplayAffinity`. Results:
  - Pass: transparency; click-through (a click on a pet reached the window below); topmost over another topmost window.
  - Pass: fullscreen pause and z-order (paused, strip behind, back on exit).
  - Pass: events while fullscreen (finished worker gone, a worker without heartbeats expired, leader `review` → `idle` after 60 s).
  - Pass: auto-hide taskbar with a maximized captioned window (not fullscreen; strip followed the work area 1400 → 1440 and back); fullscreen under auto-hide.
  - Pass: restore of an open session after an app restart; leader leaves when its terminal window is closed; auto-exit after exactly 600 s without events; token rejection (401 on `/health`, `/events`, `/exclude`).
  - Pass: leader `waiting` → `running` → `review` with a real session (AskUserQuestion); success and failure scenes with real workers; workers exit off the left edge.
  - Pass: user-role pet from a package, implementer fallback for an unconfigured user role; scale 1.0 and 0.3; `+N` and `+N sessions` overflow.
  - **Failed, fixed:** capture exclusion. `SetWindowDisplayAffinity` returned ERROR_NOT_ENOUGH_MEMORY because click-through makes the strip layered, so a real computer-user run saw the pets. Fixed in bb796d5 and rechecked with that build on the real port and state: affinity 0x11 from lock creation to release, Codex's screenshot no longer shows pets, stale lock ignored, a live child with a dead runner keeps exclusion, `/exclude` acknowledgement and 2 s grace, cold start already excluded on the first visible frame.
  - Not run: a DPI scale other than 100 % (needs a display-setting change on the user's machine); Windows 11 (not available).
  - Follow-ups: 17 (leftmost leader wanders partly off the strip), 18 (name tags overlap at small scales).
  - Still to do: the fix needs a new bundle release (`pet-v0.1.1`) and pin; pushing the tag waits for the user's approval.
