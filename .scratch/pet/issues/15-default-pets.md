# 15: Bundle the default pets

**What to build:** The five default pets (leader, researcher, critic, implementer, computer-user), drawn by the maintainer in the Codex pet package format, replace the placeholder sheets in the released pet bundle, so a fresh `install --with-pet` shows the real characters. The artwork is the human part; packaging and releasing it can be handed to an agent once the sheets exist.

**Blocked by:** 07, 13

**Status:** ready-for-human

Spec: `.scratch/pet/spec.md` (Pet configuration and artwork)

- [ ] Five packages (`pet.json` and a 1536 × 1872 sheet of 8 × 9 cells, rows in the Codex order) that pass 07's validation.
- [ ] Included in a pet release and the package pin bumped to it.
- [ ] Manual check: each pet's nine rows animate correctly in the app.

## Comments

2026-10-29: Superseded by [ADR 0002](../../../docs/adr/0002-fan-art-default-pets.md) and [ticket 02: Fan-art default pets](../../pet-tray/issues/02-fan-art-default-pets.md). The fan-art defaults and their packaging are tracked there.
