# 02: Fan-art default pets

**What to build:** A fresh install shows the maintainer's fan-art characters as the default pets: leader momo, researcher mikan, critic sion, implementer shamiko, computer-user lico. Each is a valid Codex pet v1 package that carries the fan-art notice (ADR 0002). The README states the same notice.

**Blocked by:** 01

**Status:** ready-for-agent

Spec: `.scratch/pet-tray/spec.md` (Fan-art default pets)

- [ ] The source sheets move from the untracked root `pets/machikado-mazoku/` to an art source folder under the pet feature, and the root `pets/` folder is gone.
- [ ] A re-runnable default pet generator turns the source sheets into the five packages:
  - It checks each sheet is 1536 × 2288 with the 11-row layout, and keeps rows 1–9 (the first 1872 px).
  - It encodes the result as lossless WebP.
  - It deletes each slot directory, then writes that slot's manifest and sheet.
  - Each manifest's `displayName` is the character's name. Its `description` carries the fan-art notice: unofficial fan art of 『まちカドまぞく』 (© 伊藤いづも / 芳文社), not affiliated, removed on request.
- [ ] The WebP encoder is a development dependency only. Tests, the app build, the release and the published npm package never need it.
- [ ] Resolver tests pass against the real WebP packages, and also assert each slot's character name and notice. Config and doctor test fixtures that copied bundled PNG sheets are updated for the WebP assets.
- [ ] `doctor` on an untouched install reports no pet package warnings.
- [ ] The README has an artwork section with the fan-art notice and points to the tray's Licences window.
- [ ] `.scratch/pet/issues/15-default-pets.md` gets a comment saying it is superseded by ADR 0002 and this ticket.
- [ ] Manual: the rebuilt app shows all five characters, and each animates its nine pet states correctly (`idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`).
- [ ] Manual: running the placeholder generator and rebuilding brings the placeholders back, with no fan-art sheet left in the assets or the packaged bundle.
