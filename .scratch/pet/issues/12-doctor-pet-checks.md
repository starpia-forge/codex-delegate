# 12: Doctor checks for the pet

**What to build:** With the pet installed, `doctor` tells the user what is wrong with it: a bundle that doesn't match the pin, hooks missing from the settings file the pet was installed into, hooks living in a different config directory than the current `CLAUDE_CONFIG_DIR`, a missing WebView2 runtime, an invalid pet configuration or pet package, and the pet port held by something that isn't the pet app. Without the pet, `doctor` shows nothing pet-related.

**Blocked by:** 07, 11

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Doctor user stories; Claude Code settings merge; Pet configuration and artwork)

- [ ] Each check as above, with fail or warn levels consistent with existing `doctor` checks.
- [ ] Seam 1 tests for each check, in the style of the existing doctor tests, plus a run without the pet showing no pet lines.
- [ ] `npm test` passes.
