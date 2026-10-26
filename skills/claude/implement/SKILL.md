---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

Before delegating anything, record the current commit (`git rev-parse HEAD`) as the review base.

Don't write the implementation yourself. Call the Skill tool with "codex-implement" to delegate it, passing the ticket or spec and the pre-agreed seams; Codex builds it test-first with "tdd". Delegate one ticket at a time.

After each delegation, run typechecking and the relevant test files yourself, then commit the verified ticket to the current branch. Run the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work, passing the review base as the fixed point.

Commit any fixes from the review to the current branch.
