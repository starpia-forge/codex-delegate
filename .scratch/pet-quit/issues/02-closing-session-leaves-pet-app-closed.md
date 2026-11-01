# 02: A closing session doesn't start an absent pet app

**What to build:** A user whose pet app is not running can close a Claude Code session without the app coming back with nothing to show. A leader `session-end` report is dropped when the pet app is absent and nothing is pending. Every other report, and every other case, behaves as it does today. This applies after an idle exit as well as after Quit.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Spec: `.scratch/pet-quit/spec.md` (user stories 22–26, Delivery).

- [x] The rule lives in the shared client, at the point that decides between posting, spooling and starting the helper. Hooks, the event format and the runner are unchanged.
- [x] Delivery test: `session-end` with no app listening and nothing pending causes no launch, no spool file and no helper.
- [x] Delivery test: `session-end` with no app listening and a queued event stays in order, and delivery proceeds as today.
- [x] Delivery test: `session-end` with no app listening, an empty spool and a held delivery lock is spooled, not dropped.
- [x] Delivery test: `session-end` with no app listening and a fresh `updating` flag is spooled and delivered once the update ends.
- [x] Delivery test: `session-end` with a starting app (503 health) is spooled and delivered.
- [x] Delivery test: `session-end` with a healthy app is posted as today.
- [x] Delivery test: every other leader type and worker `end`, with no app listening, still launch.
- [x] Leader hook test: through the real hook with no app listening, a `SessionEnd` input removes the session's record and starts nothing.
- [x] The pet README's description of the app's lifetime states the exception.
- [x] `npm test` passes.

## Comments

- 2026-11-01: Built test-first by Codex on `ticket/pet-quit-02`. The drop is one guard in `deliver` in `pet/client/pet-client.mjs`, after the `updating` checks; `pet-delivery.mjs`, hooks and the runner are unchanged. Added 13 delivery cases and one real-hook case. Removing the guard turns the two negative tests red. `npm test`: 456 passed, 0 failed. Codex saw intermittent failures in unchanged doctor tests under concurrent `npm test`; each passed alone and in a serial run.
