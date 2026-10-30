# 03: Document the new options and their manual checks

**What to build:** `pet/README.md` documents `nameTags` and `hideNearCursor` and adds manual checks for both.

**Blocked by:** 01, 02

**Status:** ready-for-agent

Spec: `.scratch/pet-visibility/spec.md`

- [ ] Configuration section shows both keys with defaults and the restart-to-apply note.
- [ ] Manual checks: name tags off keeps pet positions identical; clearance circle size and soft edge at 100% and at another display scale; pets reappear immediately when the pointer leaves; no effect with `hideNearCursor: false`; no polling while pets hidden.
