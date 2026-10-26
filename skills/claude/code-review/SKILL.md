---
name: code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along three axes: Standards (does the code follow this repo's documented coding standards?), Spec (does the code match what the originating issue/spec asked for?) and Correctness (does the code work?). Every axis is reviewed independently by both a Claude sub-agent and Codex, so one reviewer catches what the other misses; findings are merged per axis and reported side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
---

Three-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?
- **Correctness**: does the code actually work, with no bugs, unhandled cases or hollow tests?

Every axis is reviewed by **two independent reviewers**: a Claude sub-agent per axis, and Codex (GPT 6 Astra) covering all three axes in one run. All of them run in parallel so they don't pollute each other's context, then this skill merges their findings per axis.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in the tracker doc.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, both reviewers skip the **Spec** axis and the report says "no spec available".

### 3. Identify the standards sources

Search the repo for every file that documents how code should be written. When `CODING_STANDARDS.md` or `CONTRIBUTING.md` exists, it must be on the list.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Run both reviewers in parallel

Both reviewers get the same inputs and the same brief for each axis, so a finding only one of them reports reflects the reviewer, not the input. Neither sees the other's findings.

**Axis briefs**, used verbatim by both reviewers:

- **Standards**: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."
- **Spec**: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."
- **Correctness**: "Report defects the diff introduces: logic errors, unhandled edge cases and error paths, broken invariants, race conditions, resource leaks, security holes, and tests that pass without exercising the behaviour they claim to. For each, give the file/hunk, the input or state that triggers it, and what goes wrong. Skip style and spec conformance; the other axes cover them. Under 400 words."

First, call the Skill tool with `codex-code-review`, passing the fixed point, the commit list, the spec, the standards-source files, the smell baseline and the axis briefs. It starts the Codex review in the background and returns.

Then issue the three Claude sub-agent calls together, in the foreground. Each sub-agent prompt includes the diff command, the commit list and its axis brief, plus:

- **Standards**: the list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- **Spec**: the path or fetched contents of the spec.
- **Correctness**: the path or fetched contents of the spec, if there is one, for the intended behaviour.

If the spec is missing, skip the Spec sub-agent.

Wait for the Codex run to finish before aggregating. If it failed, report the Claude findings alone and say "Codex review unavailable" with the reason.

### 5. Aggregate

Work one axis at a time. Within an axis:

1. Merge the two reviewers' findings: a problem both reported becomes one finding.
2. Tag each finding with its source: **both**, **Claude** or **Codex**.
3. Verify every single-source finding against the code yourself: read the hunk and the code around it, then confirm or reject it. A finding the other reviewer missed is exactly what the second reviewer is for, so never drop one for being single-source; drop it only when the code shows it's wrong.

Present the axes under `## Standards`, `## Spec` and `## Correctness` headings. Under each, list the confirmed findings with their source tags, then a short **Rejected** list with a one-line reason per finding. Do **not** merge or rerank findings across axes, because the axes are deliberately separate (see _Why separate axes_).

End with a short summary:

- per axis: total confirmed findings, and the worst issue _within that axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent;
- coverage: confirmed findings found by both, by Claude only, and by Codex only.

## Why separate axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Code can also do what the spec asks, in the house style, and still be broken: a missed edge case, a test that asserts nothing. That's **Correctness**, which neither of the other axes looks for.

Reporting them separately stops one axis from masking the other.

## Why two reviewers

Any single reviewer has blind spots, and running the same model twice tends to repeat them. Claude and Codex are different models, so each catches some of what the other misses. That only works if the reviews stay independent, cover the same scope from the same inputs, and single-source findings are verified rather than discarded. The coverage line shows whether the second reviewer is earning its place.
