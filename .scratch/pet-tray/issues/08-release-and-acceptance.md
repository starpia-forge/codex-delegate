# 08: Pet release and acceptance

**What to build:** A pet release built from the finished feature by the release workflow, pinned, and installed from the real GitHub Release. It passes the manual checks of tickets 02, 03, 05 and 07 on Windows 10 against that exact bundle.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07

**Status:** ready-for-human

Spec: `.scratch/pet-tray/spec.md` (Testing Decisions: Not automated)

- [ ] A pet release is cut by the workflow, with real generated notices and no stub, and the pin is bumped to it.
- [ ] Installed from the real release into the user's home, `doctor` is clean.
- [ ] The bundle contains `THIRD-PARTY-NOTICES`, and the licences window shows the same notices.
- [ ] Every manual check from tickets 02, 03, 05 and 07 has been run against this bundle and recorded in the comments, with any failure filed as a follow-up.
- [ ] `install --without-pet` then leaves no pet files, no pet hooks and no preferences file.
