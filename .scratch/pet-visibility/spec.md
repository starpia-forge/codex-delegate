# Spec: Optional name tags and cursor clearance

Status: resolved

## Problem Statement

Every **pet** always carries its **name tag**, which some users find noisy once they know which pet is which. And the pet strip sits on top of everything near the bottom of the primary monitor, so whatever lies under a pet can't be seen or reached by eye while the user is working there.

## Solution

1. **Name tags become optional.** A top-level boolean `nameTags` in `<home>/.codex-delegate/pet.json` (default `true`). With `false`, no name tag is drawn. The layout is unchanged: pet slot width, per-row fit and strip height stay exactly as with name tags on, so toggling the option never moves a pet.
2. **Cursor clearance.** Around the mouse pointer there is an invisible circle 500 logical (CSS) pixels in diameter. Inside it the strip is not drawn: radius 0–190 px fully transparent, 190–250 px fading from transparent to opaque, beyond 250 px untouched. The cut-out applies per pixel to everything the strip draws (pets, name tags, overflow badges), so a pet half inside the circle loses only that half. It follows the pointer directly with no lag or fade-in time. A top-level boolean `hideNearCursor` (default `true`) turns it off; the diameter is fixed.

## Decisions

- Name tag means the label under a pet naming the leader or worker it stands for, not the pet artwork's name (`GLOSSARY.md`).
- Both keys are validated by the shared resolver `pet/app/ui/pet-config.mjs`, like `scale`: a non-boolean value is ignored with an issue and the default is used; `pet-doctor` therefore accepts them and reports bad values. Both are read only at app start.
- Units are logical pixels so the circle looks the same size at any display scale, matching pet sizes.
- The strip window stays click-through and the webview receives no mouse events, so the pointer position comes from the Rust side (polling the cursor) and is sent to the webview in strip-relative logical pixels.
- Polling: about 60 Hz while the pointer is within 250 px of the strip, about 10 Hz otherwise; no polling while **pets hidden** or while the strip is paused behind a fullscreen app.
- The pointer is treated the same whether a person or a `computer-user` worker moves it (the strip is excluded from capture then anyway).
- No ADR: every decision here is cheap to reverse.

## Out of scope

- Configurable clearance diameter or feather width.
- Live reload of `pet.json`.
- Making the strip interactive (it stays click-through).
- Name tag overlap at small scales (`.scratch/pet/issues/18-name-tags-overlap.md`).
