# Roles are named for their job, not their model

Roles used to share their model's name (`luna`, `astra`, `sol`, `astra-cu`), so swapping a role's model left a name that no longer matched, and the name said nothing about what the worker was for. Roles are now named for their job (`researcher`, `critic`, `implementer`, `computer-user`) and the model is only a field of the role, so a model change never renames a role.

## Consequences

The role names are the keys of the user's `~/.codex-delegate/roles.json`, so the rename broke existing override files. Old keys are not accepted as aliases: an override file naming an unknown role makes the runner refuse to start and `doctor` fail, because silently ignoring it would drop settings such as the `computer-user` bypass opt-out.
