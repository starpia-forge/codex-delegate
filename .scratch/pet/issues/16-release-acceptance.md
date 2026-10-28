# 16: Final release acceptance

**What to build:** A pet release built from the finished feature, installed with `install --with-pet` from the real GitHub Release, passes the spec's full manual checklist on Windows 10 (and Windows 11 if available) against that exact bundle, and the package pin points to it. Doesn't wait for the default artwork (15); a later release carries it.

**Blocked by:** 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Testing: Not automated)

- [ ] Pet release cut by the workflow from the branch containing tickets 02 to 14; pin bumped to it.
- [ ] Installed from the real release into the user's home; `doctor` clean.
- [ ] Every item of the spec's manual checklist run against that bundle and recorded in this ticket's comments, with any failure filed as a follow-up.
- [ ] `install --without-pet` then leaves no pet files and no pet hooks.
