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

**Release**:
A numbered version of codex-delegate. It fixes the skills, the installer and the pet app together under one version.
_Avoid_: pet release, pet version

**Pet**:
An optional desktop character that stands for one leader session or one worker, and shows what it is doing. Every running leader and worker has its own pet, so concurrent workers of the same role appear as separate pets.
_Avoid_: buddy, mascot, avatar, overlay

**Pet state**:
What a pet is currently showing, using the Codex Pet states: `idle`, `running`, `running-left`, `running-right`, `waving`, `jumping`, `waiting`, `review`, `failed`.
_Avoid_: animation, mood

**Pet enabled**:
The pet feature is installed for the user, so leaders and workers report to it. Turning it on or off is an installation choice.
_Avoid_: pet on, pet active

**Pets hidden**:
The user's choice to keep every pet off the screen while the pet stays enabled. It lasts until the user shows the pets again.
_Avoid_: disabled, off, paused

**Name tag**:
The label under a pet that tells which leader or worker it stands for. It names the session or worker, not the pet's artwork.
_Avoid_: pet name, label

**Cursor clearance**:
Pets giving way to the mouse pointer: within an invisible circle around the pointer the strip is not drawn, fading out softly at the circle's edge. It follows the pointer and changes nothing else about the pets.
_Avoid_: hover hide, mouse fade, hidden

**Overflow**:
Pets that don't fit on the screen and are shown only as a count beside the visible ones.
_Avoid_: hidden workers, hidden sessions

**Team**:
A leader together with the workers it started; workers whose leader can't be identified form a team without a leader. Pets interact only within their team.
_Avoid_: group, squad, party

**Task directory**:
A temporary directory the leader creates for one delegation to a worker. It holds the brief and the worker's result, and is removed once its result has been consumed; a failed delegation's task directory is kept until the user decides what to do with the failure.
_Avoid_: scratch dir, work folder
