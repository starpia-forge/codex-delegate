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
A named worker configuration (model, effort, sandbox, tools), such as `luna`, `astra` or `sol`.
_Avoid_: profile, persona

**Computer use**:
Operating a native desktop application through its screen: taking screenshots, clicking, typing. Driving a web browser is not computer use.
_Avoid_: desktop automation, GUI automation
