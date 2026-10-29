# 01: Overflow naming and bundled pets resolved through their manifests (prefactor)

**What to build:** Two prefactors that leave the pets looking exactly as they do today.

- **Overflow naming**: the stage snapshot reports **overflow** instead of "hidden" for pets that don't fit on the strip, so "hidden" is free to mean only **pets hidden** later. The overflow badges' tooltips say how many pets didn't fit (for example `3 more workers`).
- **Bundled pets through their manifests**: bundled default pets resolve through their own manifests, exactly like user packages. Every caller can then find a bundled pet's sheet, whatever its file name or format. The callers are the running app reading its embedded assets and the installed `doctor` reading the bundle's default pets.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

Spec: `.scratch/pet-tray/spec.md` (Overflow naming; Fan-art default pets: bundled resolution)

- [ ] The stage snapshot exposes `overflowWorkers` and `overflowSessions` with the counts the old fields had. Layout and renderer use the new names, and no overflow code still says "hidden".
- [ ] The badge tooltips read as overflow counts, not "hidden".
- [ ] The resolver takes the way to read bundled packages from its caller. The app passes a reader of its embedded assets; `doctor` passes a reader of the installed bundle's default pets.
- [ ] For a bundled slot, the resolver returns the sheet path and MIME type from that slot's manifest.
- [ ] The renderer loads every sheet, bundled ones included, from the resolver's sheet path. A custom sheet that fails to decode falls back to the bundled sheet path the resolver returned. No code assumes `spritesheet.png`.
- [ ] The placeholder generator deletes each slot directory before writing it, so each slot holds exactly its manifest and the sheet that manifest references.
- [ ] Stage and layout tests assert the renamed fields.
- [ ] Resolver tests cover four cases:
  - An unconfigured install returns the real bundled sheet path and MIME type for every slot.
  - A corrupt custom sheet resolves to the bundled path.
  - A custom sheet with a valid header that fails to decode resolves to the bundled path.
  - Each bundled slot directory contains exactly its manifest and referenced sheet.
- [ ] `doctor`, run from the packed npm package against an installed bundle, resolves the bundled defaults without package warnings.
- [ ] Manual: the rebuilt app shows the placeholders and the overflow badges exactly as before.
