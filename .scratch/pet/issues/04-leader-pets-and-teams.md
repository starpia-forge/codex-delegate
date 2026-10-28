# 04: Leader pets and teams

**What to build:** Each Claude Code session shows a leader **pet**, and the workers it starts appear beside it as its **team**. The leader pet shows `running` while working on a prompt, `waiting` only for permission prompts and questions, `running` again once the user approves or answers, `review` when a turn ends (then `idle` after 60 seconds or on the next prompt), and leaves when the session ends. Claude subagents get no pets. Hooks are registered by hand for now; the installer registers them in 10.

**Blocked by:** 01, 02

**Status:** ready-for-agent

Spec: `.scratch/pet/spec.md` (Team identity, Claude Code settings merge, Event protocol, Pet stage model)

- [ ] Leader hook script: reads the hook input on stdin, maps it per the spec (notification types filtered per 01's findings, `PostToolUse` → `resumed`), sends with the team key 01 established through the pet client; always exits 0 and prints nothing.
- [ ] If 01 found a turn-failure hook, it maps to leader `failed` (until the next prompt); otherwise leader `failed` comes only from scenes (06).
- [ ] Stage: teams keyed by team key, laid out left to right in order of appearance, workers beside their leader; leader activity rules as specified; `resumed` only leaves `waiting`; leader events ordered by `at`, older ones dropped, `session-start` starting a new generation; `session-end` tombstones the team.
- [ ] Seam 2 tests: each hook input produces the mapped event (ignored notification types produce none; event types the hook isn't registered for, such as subagent events, produce none); exit 0 with empty stdout and stderr, including with nothing listening; several real hook processes run concurrently and delivered out of order end in the right leader state.
- [ ] Seam 3 tests for team layout, every leader state transition, ordering and generations, and two teams never mixing.
- [ ] Developer instructions for registering the hooks by hand; manual check with a real session.
- [ ] `npm test` passes.
