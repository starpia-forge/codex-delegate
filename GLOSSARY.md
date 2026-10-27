# codex-delegate

Matt Pocock's skills, extended so that Claude leads the workflow and hands bounded tasks to Codex workers.

## Language

**Leader**:
The Claude Code session that talks to the user, briefs workers and verifies their results.
_Avoid_: orchestrator, main agent

**Worker**:
A single non-interactive Codex run that carries out one delegated task and reports back to the leader.
_Avoid_: subagent, executor

**Role**:
A named worker configuration (model, effort, sandbox, tools), such as `researcher`, `critic`, `implementer` or `computer-user`. A role is named for the job it does, not for the model it runs.
_Avoid_: profile, persona

**Computer use**:
Operating a native desktop application through its screen: taking screenshots, clicking, typing. Driving a web browser is not computer use.
_Avoid_: desktop automation, GUI automation

**Task directory**:
A temporary directory the leader creates for one delegation to a worker. It holds the brief and the worker's result, and is removed once its result has been consumed; a failed delegation's task directory is kept until the user decides what to do with the failure.
_Avoid_: scratch dir, work folder
