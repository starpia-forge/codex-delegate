# 03: Tray icon with pets hidden

**What to build:** While the pet app runs, it shows a tray icon. Left-clicking it toggles the pets between shown and hidden; right-clicking opens a menu with a checked **Show pets** item. **Pets hidden** is stored in the pet preferences file in pet state, so it survives idle exits, restarts and bundle updates. An app relaunched while pets are hidden never flashes pets on screen. Showing pets never breaks capture exclusion or fullscreen handling. The menu is English only until ticket 05.

**Blocked by:** None (can start immediately).

**Status:** resolved

Spec: `.scratch/pet-tray/spec.md` (Pet preferences; Pet shell)

- [ ] The tray uses Tauri's built-in tray, owned by the Rust side. Its icon is the app icon and its tooltip is `codex-delegate pet <version>`. Left-click toggles visibility without opening the menu; right-click opens the menu.
- [ ] The pet preferences file holds an optional `hidden` and an optional stored `language`. The stored language is kept apart from the effective one, and toggling visibility never writes a `language` the user didn't choose.
- [ ] Preferences have one owner in the shell, which serializes changes:
  - Saves write a temporary file and rename it over the existing one.
  - A failed save keeps the change in the running app, reports the failure on stderr and removes the temporary file.
  - The next change saves the full current preferences again.
  - A missing or invalid file means shown.
- [ ] One shell coordinator owns the **show transition**, for tray shows and for a cold start while shown. The transition is cancellable and runs these steps:
  1. Evaluate fullscreen now and place the strip behind a fullscreen window.
  2. Re-apply click-through.
  3. Apply capture exclusion when computer use is live, and verify it succeeded.
  4. Ask the renderer for a fresh frame at the current wall time and wait for its acknowledgement without blocking, with a timeout.
  5. Re-check the user's choice and capture protection right before showing, then show.
- [ ] If exclusion fails, the strip stays hidden while Show pets stays checked, and the transition retries on the next capture or tray change.
- [ ] The renderer's drawing pause is `hidden || fullscreen`, from two independent flags. The stage's lifecycle keeps ticking on wall time while drawing is paused.
- [ ] Idle exit, event intake, liveness checks and leader restore behave the same whether pets are shown or hidden.
- [ ] Rust unit tests cover:
  - Preferences parsing: a missing file, invalid JSON, wrong types and unknown keys give defaults.
  - A round-trip.
  - Replacing an existing file without leaving a temporary file.
  - A failed write keeping the in-memory change and the old file.
  - A hide-only change not creating `language`.
- [ ] Small Node tests cover the pause predicate. A worker that starts, finishes or expires while drawing is paused is covered through the existing stage tests with injected wall time.
- [ ] Manual checklist, run against the real app and recorded in this ticket:
  - The icon appears with the app and disappears at idle exit.
  - Left-click toggles; right-click opens the menu.
  - Hidden survives idle exit, restart and a bundle update, with no flash on a hidden relaunch.
  - Rapid show then hide ends hidden.
  - Showing during computer use is out of capture from the first visible frame, including after a forced exclusion failure and retry.
  - Showing during fullscreen, or while entering fullscreen during the acknowledgement wait, never appears above the fullscreen window.
  - Workers that start, finish or expire while hidden appear in their current state on reveal.

## Comments

- 2026-10-29: Implemented on `feat/pet-tray` (merged with review fixes in e138a48). Automated criteria verified by `npm test`, `cargo test` and `cargo build --release`. Manual desktop checks in this ticket are not yet run; they are carried by ticket 08 against the release bundle.
