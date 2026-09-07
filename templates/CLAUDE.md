# CLAUDE.md

How to work in this repo. **What the system *is*** lives in `docs/architecture.md` and
`docs/decisions/`; this file is only about how to behave while changing it.

**Tradeoff:** this biases toward caution over speed. For trivial tasks, use judgment.

## 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.** State assumptions; if two readings
lead to different work, present both; if a simpler approach exists, say so; if something is
unclear, stop and name it.

**Argue, don't silently comply.** If the evidence contradicts your instructions, say so in the
PR body and act on the evidence. Being overruled costs a paragraph; complying quietly costs a
release.

**Quote the read; never narrate from memory.** Before describing state or explaining a
mechanism, go and read it — `origin/main`, the row, the log. A mechanism that *sounds* right is
the most expensive failure mode there is.

## 2. Simplicity first

The minimum that solves the problem. No features beyond the ask, no abstraction for a single
use, no configurability nobody requested, no error handling for impossible states. The razor:
are we adding complexity to a system that doesn't work? Fix the disease first.

## 3. Surgical changes

Touch only what you must. Don't improve adjacent code; match the surrounding style. Notice
unrelated dead code? Mention it, don't delete it. **Don't delete what you can't explain** —
code or data.

## 4. Goal-driven execution

Turn tasks into verifiable goals ("fix the bug" → "write the test that reproduces it, make it
pass"). For multi-step work, state the plan with a check per step.

## 5. Verify it yourself

A passing suite proves the suite passed. Rerun the check with your own hands. Probe the layer
that actually fails. Ask what your check cannot see. When wrong, retract in the same place you
claimed it and say what misled you.

## 6. Refuse, don't guess

Refuse, don't clamp. No silent skips — anything deliberately not done emits a structured line
naming what and why. Deterministic trigger → semantic decider → deterministic consequence: an
LLM may decide; it may not write or compute. One-sided state must name itself.

## 7. Mechanics that bite here

<!-- Fill in from the repo; delete anything not true of it. Examples: -->
- **Capture exit codes directly.** `<gate> | tail` reports the pipe's status. Redirect to a
  file, then read `$?`.
- **`<GATE COMMAND>` is the CI gate** — run it before pushing.
- **Audit greps run on `origin/main`** (`git grep <pat> origin/main`); local checkouts park on
  stale branches.
- **CI has no `<API KEY>`.** Stub the client in any test touching that path; reproduce with
  `<API KEY>= <gate>`. `find_dotenv()` walks UP out of worktrees.
- Every change goes on a branch `<type>/<issue>-<slug>` with a conventional commit and a PR.
  Never commit to main.
