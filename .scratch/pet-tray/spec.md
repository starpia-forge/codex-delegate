# Spec: Pet tray icon, licence notices, display language and fan-art default pets

Status: ready-for-agent

## Problem Statement

Once the **pet** is enabled, the user has no way to control it short of the installer. A pet strip that is in the way, during a screen share, a presentation or just a busy afternoon, can only be removed with `install --without-pet`, which deletes the pet app, its hooks and all of its state. The user can't even tell whether the pet app is running, because the strip has no window, no taskbar entry and ignores every click.

The pet app also ships hundreds of open-source Rust crates compiled into one executable, yet tells the user nothing about them, which falls short of the notice obligations of licences such as MIT and Apache-2.0. Its few visible words are English only, while the maintainer and part of the audience read Korean.

Finally, the bundled default pets are still development placeholders. The maintainer wants the characters they made as a fan of 『まちカドまぞく』 to be what a fresh install shows.

## Solution

While the pet app runs, it shows a **tray icon** in the Windows notification area. Left-clicking the icon toggles whether pets are on screen. Right-clicking it opens a menu with three entries:

- **Show pets**: a checked item; unchecking it means **pets hidden**.
- **Licences**: opens a window with every licence notice the pet app owes.
- **Language**: a submenu listing every language by its own name (`English`, `한국어`), with the current one checked; choosing one switches to it. (Superseded the one-step toggle; ticket 09.)

Pets hidden is remembered in the pet's own state, so the pets stay off screen across idle exits, restarts and bundle updates until the user shows them again. Removing the pet still works the existing way: `install --without-pet` removes only the pet and keeps the skills. `list` and `doctor` say when pets are hidden, so an empty strip is never mistaken for a fault.

The licences window lists the codex-delegate licence, the fan-art notice and the licence texts and copyright lines of every compiled Rust crate whose licence requires a notice. The release build generates that list from the locked dependency set, so it can't fall out of date.

The five default pets become the maintainer's fan-art characters: leader momo, researcher mikan, critic sion, implementer shamiko, computer-user lico. Each is credited to the original work and its rights holder, is marked as unofficial, and will be removed on the rights holder's request (ADR 0002).

## User Stories

### Tray icon

1. As a user with the pet enabled, I want a tray icon whenever the pet app is running, so that I can see at a glance that it is running.
2. As a user, I want the tray icon to stay present while pets are hidden, so that I always have a way to show them again.
3. As a user, I want the tray icon to disappear when the pet app exits after its idle timeout, so that a stale icon never points at a process that is gone.
4. As a user, I want the tray icon to return together with the app the next time a leader or worker reports, so that I can control the pet without starting anything by hand.
5. As a user, I want hovering the tray icon to show `codex-delegate pet` and the running bundle version, so that I can tell which build I'm looking at.
6. As a user, I want the tray icon to use the pet app's own icon, so that I can recognise it among other tray icons.
7. As a user, I want left-clicking the tray icon to toggle the pets between shown and hidden, so that the most common action is one click.
8. As a user, I want right-clicking the tray icon to open its menu, so that the other actions are where Windows users expect them.
9. As a user, I want the tray menu to contain only Show pets, Licences and Language, so that it stays simple and every other operation stays with the CLI.
10. As a user, I want the tray to offer no quit or uninstall entry, so that I'm never left without a way back and my Claude Code settings are only changed by the installer.

### Pets hidden

11. As a user, I want unchecking Show pets to take every pet off the screen at once, leaders and workers of every team alike, so that one action clears the strip.
12. As a user, I want checking Show pets again to bring back exactly the pets that are running now, in their current pet states, so that showing them never replays stale activity.
13. As a user, I want the pet app to keep receiving events while pets are hidden, so that showing them later is accurate immediately.
14. As a user, I want the strip to stop animating while pets are hidden, so that hidden pets cost almost no CPU.
15. As a user, I want pets hidden to persist after the app exits after ten idle minutes and is relaunched by the next event, so that hidden pets don't come back on their own.
16. As a user, I want pets hidden to persist across a reboot, so that my choice survives a restart.
17. As a user, I want pets hidden to persist across a pet bundle update, so that updating codex-delegate doesn't undo my choice.
18. As a user, I want an app relaunched while pets are hidden to show only its tray icon and never flash pets on screen first, so that hiding is reliable.
19. As a user, I want showing pets during computer use to keep them out of screen capture from the first visible frame, so that a worker's screenshots never contain them.
20. As a user, I want showing pets while a fullscreen app is in front to keep the strip behind it and paused, so that showing pets never covers a game or video.
21. As a user, I want the idle timeout to work the same whether pets are shown or hidden, so that a hidden pet app doesn't linger for no reason.
22. As a user, I want hiding the pets to leave the pet enabled, its hooks registered and its bundle installed, so that hiding is instant and fully reversible.
23. As a user, I want `install --without-pet` to remain the way to remove the pet while keeping the skills, so that there is one well-defined removal path.
24. As a user, I want `install --without-pet` and `uninstall` to remove the stored hidden choice and language together with the rest of the pet state, so that a later reinstall starts from defaults with pets shown.
25. As a user, I want `list` to show `hidden` next to the pet state when pets are hidden, so that I can explain an empty strip without opening the tray.
26. As a user, I want `doctor` to report that pets are hidden without treating it as a warning or a failure, so that a deliberate choice never looks like a fault.
27. As a user, I want `list` and `doctor` to treat a missing or unreadable preferences file as pets shown and to say nothing about it, so that a fresh install reports nothing unusual.

### Display language

28. As a user, I want the pet app to start in Korean when my Windows display language is Korean and in English otherwise, so that the first thing I see is in my language.
29. As a user who can't read the current language, I want the Language submenu to be labelled `Language` in English and `<word for language> (Language)` in any other language, and to list each language in its own name, so that I can always find my way back to a language I read.
30. As a user, I want to pick a language from the submenu rather than cycle through them, so that one stray click never switches me to a language I can't read.
31. As a user, I want a language change to apply at once to the tray menu, the tooltip, the overflow badges and an open licences window, so that the app never shows two languages at the same time.
32. As a user, I want my chosen language remembered across idle exits, restarts and bundle updates, so that I choose it once.
33. As a user who never chose a language, I want the app to keep following my Windows display language, so that changing Windows changes the pets too.
34. As a user, I want role names, worker labels and pet names left untranslated, so that what I see on a name tag matches what I type in `pet.json` and see in the CLI.
35. As a user, I want the CLI output to stay in English, so that the display language only affects the pet app.

### Licences window

36. As a user, I want Licences to open a normal window I can focus, scroll, resize and close, so that I can actually read the notices.
37. As a user, I want clicking Licences while the window is already open to bring that window to the front instead of opening a second one, so that windows don't pile up.
38. As a user, I want the licences window to open even while pets are hidden, so that the notices are always reachable.
39. As a user, I want the licences window to show codex-delegate's own MIT licence, so that the project's terms are stated.
40. As a user, I want the licences window to show the fan-art notice, naming the original work and its rights holder, so that the artwork's status is transparent.
41. As a user, I want the licences window to list every compiled Rust crate whose licence requires a notice, with its name, version, licence and the full licence text with its copyright lines, so that the app meets those obligations.
42. As a user, I want crates whose licences carry no notice obligation in a binary left out of the list, so that the list contains only what is required.
43. As a user, I want the window's title, section headings and empty states translated, and the licence texts kept in their original English, so that I can navigate in my language while the legal text stays authoritative.
44. As a user, I want the licences window to stay out of the click-through strip's behaviour, so that opening it never makes the strip block clicks.
45. As a user running a developer build without generated notices, I want the window to say that third-party notices are produced by the release build, so that an empty list is never mistaken for a release.

### Release

46. As the maintainer, I want the release workflow to generate the crate notices from the locked dependency set before building the app, so that the shipped list always matches the shipped binary.
47. As the maintainer, I want the release to fail when a crate's licence isn't on the list of known licences, so that an unclassified licence never ships silently.
48. As the maintainer, I want the bundle packager to refuse to build a bundle without the generated notices or with the development stub, so that no release goes out without them.
49. As the maintainer, I want the bundle to carry the notices as a plain file next to the app as well, so that they can be read without starting the app.

### Fan-art default pets

50. As a user, I want a fresh `install --with-pet` to show momo as the leader, mikan as the researcher, sion as the critic, shamiko as the implementer and lico as the computer-user, so that the feature shows its real characters out of the box.
51. As a user, I want every bundled default pet to be a valid Codex pet v1 package, so that I can copy one into Codex and it works there too.
52. As a user who configured my own pet for a slot, I want my configuration to keep winning over the new defaults, so that the change of artwork doesn't override my choice.
53. As a user, I want user roles without configured artwork to keep falling back to the implementer slot, now shamiko, so that the fallback rule is unchanged.
54. As a user, I want each default pet's description to say it is unofficial fan art of 『まちカドまぞく』 (© 伊藤いづも / 芳文社), unaffiliated with the rights holder, and removed on request, so that the notice travels with the package.
55. As a reader of the README, I want the same fan-art notice there, so that I know the artwork's status before installing.
56. As the maintainer, I want the source sheets kept under the pet's art folder, separate from the app's assets and from user pets, so that the repository layout doesn't confuse source art with packages.
57. As the maintainer, I want one re-runnable script to turn the source sheets into the five packages, so that a corrected source sheet is one command away from the bundle.
58. As the maintainer, I want the packages to keep only the nine rows of the Codex v1 layout and leave the two extra look-around rows unused, so that the packages pass validation.
59. As the maintainer, I want the packaged sheets stored as lossless WebP, so that the executable doesn't grow by the full size of the source PNGs.
60. As the maintainer, I want the placeholder generator kept, so that a takedown can restore the placeholders and be released quickly (ADR 0002).
61. As a user, I want `doctor`'s pet package checks to accept the new default packages, so that an untouched install reports no pet package warnings.

### Overflow naming

62. As a contributor, I want the stage model to say overflow, not hidden, for pets that don't fit on the strip, so that "hidden" means only pets hidden by the user.
63. As a user, I want the overflow badges' tooltips to say how many pets didn't fit (for example `3 more workers`), so that they aren't confused with pets hidden from the tray.

## Implementation Decisions

- Accepted deviation: the renderer reads bundled pet files with same-origin `fetch()`, so the CSP includes `'self'` in `connect-src`.
- Accepted deviation: the IPC dispatcher limits licences-window commands by window label; Tauri's per-window command ACL would require changing the strip capability.

### Pet preferences

- A new **pet preferences** file in the pet state directory holds the user's tray choices: `hidden` (boolean) and `language` (`"en"` or `"ko"`). Each key is optional. A missing file, an unreadable file or an invalid value means pets shown and the language follows Windows.
- `language` is written only when the user switches languages. Until then, the app derives the language from the Windows user display language each time it starts: Korean means `ko`, anything else means `en`.
- Only the pet shell writes the file, by writing a temporary file and renaming it over the existing one, the way it already publishes its process file. The installer never writes it. Bundle updates leave it untouched because the state directory survives updates. Removal deletes it with the state directory.
- Preference changes are serialized on one owner in the shell. When a save fails, the change still applies to the running app, the failure goes to stderr and the temporary file is removed. The next change saves the full current preferences again. A failed save never shows a dialog.
- The CLI only reads the file, for `list` and `doctor`. It treats the file exactly as the shell does: unknown keys are ignored and invalid values fall back to the defaults.
- The user's `pet.json` stays read-only to the app. Tray choices never go there.

### Pet shell (Rust)

- Accepted deviation: the watcher re-asserts topmost whenever the visible, unpaused strip lacks it, not only on foreground changes. A native topmost refusal is retried as NOTOPMOST then TOPMOST and never blocks showing.
- The tray uses Tauri v2's built-in tray icon and menu, enabled through Tauri's `tray-icon` feature. No renderer capability is added: the Rust side owns the tray and its events.
- Tray contents: the icon is the app icon. The tooltip is `codex-delegate pet <version>`; only the prefix is a name, so it is not translated. The menu is a check item for Show pets, an item for Licences and a Language submenu (see ticket 09). A left click toggles visibility and doesn't open the menu; a right click opens the menu.
- The tray is created in setup, before the strip's first show. When preferences say hidden, the strip is never shown.
- Hiding hides the strip window. Showing, both from the tray and at a cold start while shown, goes through one **show transition**. The transition does not reuse the current cold-start code, which shows before fullscreen placement is checked and can't tell whether capture exclusion succeeded. Its steps, in order:
  1. Evaluate fullscreen now, without waiting for the 300 ms watcher. If fullscreen, place the strip directly behind the fullscreen window without topmost.
  2. Re-apply click-through.
  3. If computer use is live, apply capture exclusion and check that it succeeded. If it fails, the strip stays hidden and the transition is retried with bounded backoff while pending and shown, as well as on capture or tray changes. Hiding or a newer generation cancels a scheduled retry. The tray's Show pets stays checked, because the user's choice is unchanged.
  4. Ask the renderer to reconcile the stage at the current wall time and draw one fresh frame, and wait for its acknowledgement (bounded; on timeout, show anyway).
  5. Show the window.
- The renderer's drawing pause is derived as `hidden || fullscreen` from two independent flags; it is no longer a single `paused` boolean overwritten by each event. Leaving fullscreen while hidden keeps drawing paused, and showing while fullscreen stays paused. While drawing is paused, the stage's lifecycle keeps ticking on wall time, as it does for fullscreen today.
- The shell tells the renderer about visibility and language changes through events, and exposes the current preferences through a command for the renderer's start-up.
- The idle exit, event intake, liveness checks and leader restore behave the same whether pets are shown or hidden.
- Language switches rebuild the tray menu labels and the tooltip, then notify the renderer and the licences window.
- The licences window is a second webview window created on demand. It is decorated, focusable, resizable and has a taskbar entry. It doesn't follow the strip's click-through, topmost or fullscreen handling, and it is not excluded from capture. Opening it while it exists focuses the existing window. Closing it destroys it.
- The licences window gets its own capability, granting only what it uses: event listening and the two read commands below. The strip's capability is unchanged.
- The catalogue and the notices document reach both webviews through shell commands (`messages` and `notices`).
- On start, a webview first subscribes to language events and then asks for the current language and catalogue, so a switch made in between is never lost.

### Translation catalogue

- One catalogue holds every translatable string, keyed by message id, with an English and a Korean text for each. The shell embeds it at build time and serves it to the renderer and the licences window through its `messages` command.
- Translated: the tray menu labels, the licences window's title, headings and empty states, and the overflow badges with their tooltips. Not translated: role names, worker labels, pet names, licence texts and all CLI output.
- English is the fallback for a missing key, and the catalogue test ensures there are none.

### Licence notices

- **Notice generator**: a Node script in the release tooling. It takes `cargo-about`'s JSON output for the pet app's manifest and returns the notices document.
- `cargo-about` runs with a committed configuration and a pinned version:
  - Target: only `x86_64-pc-windows-msvc`.
  - Dependencies: build and dev dependencies are ignored, because they aren't compiled into the executable.
  - `accepted`: an ordered list with the notice-free licences first, so a choice such as `MIT OR Unlicense` resolves to the notice-free option.
  - The run uses `--locked` and `--fail`, so an unidentified licence fails the release.
  - Every component of an `AND` expression is kept and noticed.
- Clarifications: when `cargo-about` can't harvest a crate's required copyright lines or its Apache `NOTICE` content, a reviewed clarification bound to that crate's version goes into the committed configuration. The generator fails on any notice-bearing crate that still lacks its licence text. It never substitutes a generic licence text for missing attribution.
- For MIT, BSD-2-Clause, BSD-3-Clause and ISC, the generator fails naming the crate only when copyright lines contain template placeholders with no non-placeholder line; absent or year-only lines pass, and Apache appendix placeholders never fail.
- Apache-2.0 crates that ship a `NOTICE` file carry its content in the document.
- In the release workflow, the notices are generated once, before `cargo build`. That same file is placed in the UI assets for embedding and handed to the packager. The generated document is ignored by git.
- The generator also writes a crate-only `.crates` companion. The shell embeds it and exposes it as `third_party` in the `notices` command, so the window never parses project or fan-art headings out of the full bundle document. A generated document without its companion fails the build.
- **Notices document** contents:
  - codex-delegate's MIT licence.
  - The fan-art notice.
  - Every crate whose selected licence carries a notice obligation in binary form, as name, version, licence id and the licence text with its copyright lines. Crates that share an identical licence text are grouped under it.
- Licence classification:
  - Licences without a binary notice obligation are excluded: `0BSD`, `MIT-0`, `Unlicense`, `CC0-1.0`, `Zlib`, `WTFPL`, `BSL-1.0`. Boost's licence exempts copies made only of machine-executable object code.
  - Licences with one are included: `MIT`, `Apache-2.0`, `Apache-2.0 WITH LLVM-exception`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Unicode-3.0`, `Unicode-DFS-2016`, `MPL-2.0`.
  - For a licence expression with alternatives, `cargo-about`'s choice of licence (by the `accepted` order) is used.
  - A crate whose selected licence is in neither list fails the generator, and therefore the release.
- The bundle packager takes the notices document as an explicit input and also ships it as a plain-text `THIRD-PARTY-NOTICES` file at the bundle root. It refuses to package when the input is missing or is the development stub. The installer copies the bundle as it already does.
- A build without the generated document embeds a stub that carries a stub marker. The window shows the stub as "generated by the release build".

### Fan-art default pets

- The source sheets move from the untracked root `pets/machikado-mazoku/` to an art source folder under the pet feature. The root `pets/` folder is removed.
- A **default pet generator** script, alongside the placeholder generator, does the conversion:
  - It reads each source sheet, checks the 1536 × 2288 size and the 11-row layout, and keeps the first 1872 px (rows 1 to 9).
  - It encodes the result as lossless WebP and writes a v1 package (`pet.json` and the sheet) into the bundled asset folder for the assigned slot.
  - Slot assignment: leader momo, researcher mikan, critic sion, implementer shamiko, computer-user lico.
  - Each manifest's `displayName` is the character's name. Its `description` carries the fan-art notice.
- WebP encoding uses an image library added as a development dependency. Only the generator uses it; its outputs are committed, so tests, the app build and the release never need it, and the published npm package never contains it.
- Bundled packages are resolved like any other package. The resolver reads the bundled manifest from the app assets and returns its sheet path and MIME type, so a bundled result carries a sheet path just as a user package's result does.
- The renderer loads every sheet, bundled ones included, from the resolver's sheet path. It also uses that path for the fallback when a custom sheet fails to decode. No code assumes `spritesheet.png` anywhere.
- Both generators, fan-art and placeholder, replace each slot directory wholesale: they delete the directory, then write the manifest and the one sheet it references. A slot directory therefore never keeps a stale sheet. After a takedown, neither the bundle nor the embedded assets contain the withdrawn art.
- The placeholder generator stays as the takedown fallback (ADR 0002).
- README gains an artwork section with the fan-art notice and a pointer to the tray's Licences window.

### Overflow naming

- The stage snapshot's `hiddenWorkers` and `hiddenSessions` become `overflowWorkers` and `overflowSessions`, with the same values. The layout and the renderer follow; the rename brings no change in behaviour.

### CLI

- `list` appends `, hidden` to the `Pet: enabled …` line when preferences say hidden.
- `doctor` adds an OK-level line when pets are hidden, telling the user they can show them from the tray icon. It prints nothing when pets are shown, and nothing at all when the pet isn't installed.

### Unchanged

- Hooks, event delivery, the HTTP protocol, team handling, scenes and the installer's install, update and removal paths are unchanged apart from the packager's notice requirement.

## Testing Decisions

- Good tests here drive public seams and check observable results: stage snapshots, resolver output, CLI stdout and files on disk, bundle contents and generator output. They never check internal calls or private state.
- **Stage model**: the existing stage tests assert the renamed snapshot fields, with the same counts as before. Prior art: the overflow cases in the stage and layout tests.
- **Pet configuration resolver**: the existing "all five real bundled packages pass validation" test keeps running against the real bundled assets, now the WebP fan-art packages. New assertions:
  - With no configuration, the resolver returns the real bundled WebP sheet path and `image/webp` for every slot.
  - A corrupt custom sheet resolves to that same bundled fallback path.
  - Each slot's manifest names the assigned character, and each description carries the fan-art notice.
  - Each bundled slot directory contains exactly its manifest and the sheet it references.

  The default pet generator gets no tests of its own; its output is verified only through the resolver. Fixtures in the config and doctor pet tests that copy bundled PNG sheets are updated for the WebP assets.
- **CLI**: run as a child process with an isolated home, following the doctor and install pet tests. The cases:
  - `list` shows `hidden` for `{"hidden": true}`, and shows nothing extra for a missing file, `{"hidden": false}`, invalid JSON or a non-boolean value.
  - `doctor` prints the hidden line only when hidden, at OK level, and prints nothing pet-related without a pet.
  - `install --without-pet` removes the preferences file with the state directory.
  - An update keeps the preferences file byte for byte.
- **Notice generator**: a new Node test feeds hand-written `cargo-about`-shaped JSON and asserts:
  - Notice-bearing licences are included and notice-free ones excluded.
  - Identical texts are grouped.
  - Copyright lines are kept.
  - The project licence and fan-art notice are present.
  - An unknown licence fails with the crate's name.
  - The output is deterministic, so the same input gives the same bytes.
- **Translation catalogue**: a new Node test asserts every message id has non-empty English and Korean texts, and every message id used by the renderer and licences window exists in the catalogue.
- **Bundle packager**: the existing bundle test passes a fixture notices file as the packager's explicit input. It asserts:
  - The zip contains `THIRD-PARTY-NOTICES` with exactly those bytes.
  - Packaging with a missing notices input or the stub fails before writing anything.

  Prior art: "bundle CLI refuses a missing input before writing release artifacts". The release workflow additionally runs the notice generator on the real `cargo-about` output as a smoke check, before building.
- **Renderer pause**: the drawing pause, `hidden || fullscreen`, lives in a small pure module tested in Node. It covers both event orders (hide then fullscreen and back, fullscreen then hide and back) and a worker that starts, finishes or expires while hidden, which must show its current lifecycle state on reveal. Prior art: the stage tests with injected wall time.
- **Shell (Rust)**: `cargo test` unit tests, like those already in the shell. They cover:
  - Preferences parsing: a missing file, invalid JSON, a wrong type or unknown keys give defaults, and valid values round-trip.
  - Replacing an existing file works and leaves no temporary file.
  - A failed write keeps the in-memory change and leaves the old file intact.
  - Language resolution: a stored language wins; otherwise Korean Windows language ids map to `ko` and all others to `en`.
  - The language toggle order.
- **Not automated**: tray behaviour gets a manual checklist in its ticket, run against the real app on Windows 10, like the existing strip checklist. The checklist:
  - The icon appears with the app and disappears at idle exit.
  - Left-click toggles; right-click opens the menu.
  - Hidden survives idle exit, restart and update, and no flash happens on a hidden relaunch.
  - Showing during computer use keeps the pets out of capture from the first visible frame; showing during fullscreen never flashes above the fullscreen window, including right after entering fullscreen.
  - The licences window opens after a language change in the right language, and follows a change made while it is open.
  - Language switching updates the menu, tooltip, badges and an open licences window.
  - The licences window opens, focuses, scrolls and closes, and is reachable while hidden.
  - The initial language follows a Korean and an English Windows display language.

## Out of Scope

- Quitting the pet app from the tray, and any way to suppress relaunching it.
- Removing or disabling the pet from the tray. Removal stays `install --without-pet` and `uninstall`.
- Hiding per team, per role or per pet.
- Languages other than English and Korean, and translating CLI output, role names, worker labels or licence texts.
- Using the source sheets' two extra look-around rows, or extending the Codex pet format.
- Notices for WebView2 (an OS component, not shipped), for the skills installed from mattpocock/skills (not part of the pet bundle), and for user-supplied pet packages.
- macOS and Linux tray support. The pet stays Windows-only.

## Further Notes

- ADR 0002 records the decision to ship unofficial fan art as default pets and the takedown procedure: release with the placeholders restored, then delete the artwork. Packaging the art supersedes ticket 15 of the pet spec, which planned maintainer-drawn originals.
- Glossary terms used: **pet**, **pet state**, **team**, **pet enabled**, **pets hidden**, **overflow**.
- The fan-art packages are larger than the placeholders even as lossless WebP. If the executable grows enough to matter, the next step is lossy WebP at a high quality, decided against measured sizes.
