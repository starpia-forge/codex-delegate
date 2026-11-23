# 01: Split the implement and implement-spec patches into shared and standard-only parts

Spec: `.scratch/delegation-mode/spec.md`

**What to build:** A prefactor that makes the minimum **delegation mode** possible without changing anything users receive. Today's `implement` and `implement-spec` patches mix two kinds of change. Both modes need the first kind: recording the review base, passing it to `code-review` as the fixed point, running checks and committing per ticket, and having the exploration subagent use `codex-research` for external documentation. Only standard needs the second kind: the `codex-implement` delegation. Split each patch into a shared patch and a standard-only patch that layers the delegation on top. Teach the skills build to apply the shared patches plus the patches in a per-mode sub-directory, starting with a `standard` sub-directory only. The generated Claude Code skills stay byte-identical to today.

Work on a feature branch. It merges to `main` only after ticket 04's acceptance, because a push to `main` publishes a Release (ADR 0003).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [ ] Rebuilding the skills at the pinned upstream commit leaves the generated skills tree with no diff
- [ ] No shared patch mentions `codex-implement`; the standard-only patches contain only the delegation changes
- [ ] If any shared or per-mode patch fails to apply, the build exits and leaves the generated skills and the upstream pin untouched
- [ ] The existing test suite passes
