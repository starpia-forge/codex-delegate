# Agent skills

### Commit Guidelines

Write commit messages in English, following the Conventional Commits specification.

A change to anything users receive is a `feat` or `fix`, whichever files it touches; that is what puts it in a Release. Merge commits use `merge:`. `docs/releasing.md` has the rules.

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.