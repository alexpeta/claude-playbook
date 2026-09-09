# Lessons — mechanics that cost real work once

Each entry: the rule, then the incident that minted it. Generalized; the project-specific
command lives in that project's `CLAUDE.md`.

## Gates and CI

- **Capture exit codes directly.** `check | tail` reports the pipe's status. Redirect to a
  file, then read `$?`; trust only the exit file — stage prose ("All checks passed!") has
  printed before the tests ran. *(PR #63; a builder read "passed" twice while the chain exited 1.)*
- **CI is keyless.** No API keys in CI; a test that reaches a real LLM call passes locally on
  the developer's `.env` and crashes in CI. Stub the LLM constructor on any LLM-touching path;
  reproduce CI with the empty key exported (`KEY= run-the-gate`), not by moving `.env` —
  `find_dotenv()` walks UP out of worktrees and drinks the parent checkout's keys.
- **The unit gate is not the whole gate.** An integration tier that runs on a label or nightly
  is a blind spot for every local check; a symbol move that breaks only that tier passes
  everything you normally watch. Grep the integration tests too; never `head`-truncate a grep.
- **A conflicting PR gets no CI run at all.** GitHub cannot build the merge ref, so
  `synchronize`, `labeled`, `reopened` and empty commits all produce nothing. Check
  `mergeable` before chasing a missing run. *(#2359, 2026-09-07: two hours lost.)*
- **A gate that got lucky is not a gate.** Re-gate on any new head, always; a gate keyed to a
  stale head is evidence about a tree that no longer exists. Gate artifacts are per-agent and
  per-head (`<issue>-<worktree-id>`), never a shared `/tmp/g*` that a sibling can pick up.
- **A test that cannot fail is a finding.** Before trusting a green, ask what input would have
  to exist for it to go red; if nothing in the corpus can, the guard is vacuous. *(A
  date-keyed readiness fixture graded INSUFFICIENT_DATA whatever the readings said, and passed
  because two labels folded onto one decision — found by a mutation that did not go red.)*
- **Metrics inherit the blind spots of their instrumentation.** A 14-day "clean" clock read
  all-zero while a destructive write went through a path it never instrumented. Prefer
  outcome-shaped denominators (every audit row) over signal-shaped ones (the alarms you installed).
- **A test that derives "today" from a different clock or day function than the code is a
  time bomb with a calendar fuse.** Two helpers keyed the weekday on the UTC date while the
  code resolved a 05:00-floored local coaching day; main went red every evening at UTC
  midnight, with no change to blame. Derive the value from the function the code uses, or
  freeze the clock the code reads; and run the suite once at a boundary hour before
  trusting a day-shaped test.
- **A test with a literal future timestamp is a time bomb.** A fixture hard-coded a proposal's
  `expires_at` a day ahead; the code under test read the WALL clock for expiry while the test
  froze a different clock, so at the minute the literal passed, every gate on main went red
  with no change to blame. Freeze the clock the code actually reads (one injectable clock per
  module), or key the literal off the real clock; never both clocks in one module.
- **Never `gh run watch` in an unattended loop** — ~1200 API calls an hour each; four of them
  exhausted the hourly budget and 403'd every chain and builder. Poll every 90–180 s.

## Parallel agents and worktrees

- **One tree per mutating agent.** Two agents in one checkout corrupted each other's HEAD.
  `isolation: worktree` for agents; a `git worktree add` for the chair's own side work; never
  `git checkout` in the main tree while a gate chain has it detached (a false red on a real PR;
  repeated 2026-09-07 with a `checkout main && pull` under a running gate — recovery: kill that
  gate, delete its exit artifact, clear the stale lock, relaunch it). Make the check a habit:
  `ls /tmp/<tree-lock>` before any command that touches the main tree.
- **Worktrees isolate the repo, not the scratchpad.** Builders overwrote each other's PR body,
  gate script and comment draft mid-run; one victim's first green came from the WRONG worktree.
  Scratch under a run-unique path, always.
- **A worktree gate can silently test main.** A shared virtualenv's `.pth` points at the main
  checkout's `src/`. Each worktree installs its own environment and asserts the package
  resolves inside the worktree before trusting any green.
- **Never `git stash` in a shared repo.** Stash refs are repo-global; one agent's red-first
  stash-pop captured a sibling's in-progress edits. Copy files aside instead.
- **PR-state is not liveness.** "No pushed branch" means "hasn't pushed yet"; a live builder's
  worktree was deleted in a hygiene sweep on that assumption. Sweep only worktrees whose task
  has reported AND whose PR is merged or closed; skip anything with unexplained uncommitted
  content; harvest the builder's memory notes first (they live inside the worktree).
- **A session branch or process restart drops subagent transcripts.** Three builders parked on
  five-minute pollers ("rebase when PR X merges") silently ceased to exist when the chat was
  branched; their heads never moved and nothing reported it. Never park a builder on a long
  wait — have it finish and report, and re-dispatch a fresh one when the trigger lands; treat
  an agent id as unreachable after any session boundary until it answers.
- **Squash merges break ancestor tests.** `merge-base --is-ancestor` says "unmerged" for
  squash-merged work; test mergedness with the PR state or `git log --grep`.
- **Serialize merges behind releases.** One release runner plus a "upstream changed" refusal
  means a merge stream faster than the drain rate releases nothing (six merges, zero deploys
  in one night). Merge one, wait for the tag AND the health endpoint, then the next.
- **A release is verified by the newest tag plus the health endpoint**, never by `describe` on
  the merged sha — the release tool tags its own bump commit on top.
- **Two builders on one function.** Two PRs modifying the same function in one day compose
  textually and can still be wrong together; the second to land re-reads the first.
- **An agent definition placed this session is not dispatchable this session.** `bin/init`
  drops `.claude/agents/builder.md` into the repo, but the Agent tool's type list is read at
  session start; `subagent_type: "builder"` answers "not found" until the next session.
  Dispatch with `general-purpose`, `model: opus`, `isolation: worktree`, and the definition's
  body inlined at the top of the brief — same contract, no restart. *(photolab, 2026-09-07:
  first dispatch on a freshly bootstrapped repo.)*

## Environments and tooling

- **The shell is zsh.** Arrays are 1-indexed; a bash-idiom loop silently shifted every issue
  title by one. `set -e` does not stop a failure inside `$(…)`. Check every captured variable.
- **Environment cleanup is a ledger item.** Per-worktree virtualenvs reached 17 GB and 76
  environments before anyone looked; two image tags per release filled a NAS to 263 GB of
  Docker images. Measure (`du`, `docker system df`), prune by an explicit filter (a label, a
  dead path), never by "the first match" — one sweep that guessed the wrong `.pth` deleted six
  live environments including two running builders'.
- **Long operations over SSH run detached.** An `expect` session's timeout killed a prune
  mid-way (the daemon kept going, blind). `nohup … &` on the far side, poll a log that ends with
  `DONE`. In Tcl, square brackets inside the spawn string are command substitution.
- **A laptop sleeps between heartbeats** unless something holds it awake; an unattended run on
  a sleeping machine stalls without an error. Check the power log before blaming the pipeline.
- **Prefer the CLI over an MCP for the same service** when the repo's conventions are written
  against the CLI (`gh`, `psql`); ask rather than guess a host or credential.
- **`git -C <dir> rev-parse --git-path <file>` answers relative to YOUR cwd, not to `<dir>`.**
  Test that path from another directory and it is a missing file. Use `--absolute-git-dir` and
  append the name. *(`bin/wake`, 2026-09-07: the "fetching now" note fired on every session
  from every repo except the playbook itself.)*
- **BSD awk rejects a `-v` value that contains a newline** ("newline in string"); GNU awk
  accepts it, so a script tested on Linux breaks on macOS. Pass one `-v` per line and `print`
  them in order. *(`bin/install`, 2026-09-07: the marked block in CLAUDE.md was deleted and
  re-appended on every run instead of replaced in place.)*

## Writing and briefing

- **A count in a brief is computed with the code's own filter.** `47 files − 6 print masters
  = 41` forgot the three `.md` and the `.DS_Store` the suffix rule skips; the builder counted
  with `find` plus the rule and got 37. Never subtract from `ls | wc -l`; run the filter.
  *(photolab #2, 2026-09-07: the first PR's "Where the brief was wrong".)*
- **Brief from the repo at dispatch time, not from a summary.** Eight wrong briefs in one day
  shared that cause; the builder who argued with the brief was right every time. Every brief
  lists what to verify first and asks for a "Where the brief was wrong" section.
- **Say done after done.** Two claims made before the action; both retracted the same day.
- **Timestamps come from the clock.** Three ledger lines were stamped thirty minutes ahead of
  reality and had to be corrected.
- **Mirror the producer's formula in a sibling surface** — grep the producing function and
  quote it — never choose a formula that sounds right. *(A dashboard shipped Epley where the
  system computes Brzycki; two numbers for one lift.)*
- **Measure before optimizing.** Instrument, read, decide; park low-value work; a rejected
  architecture is not re-proposed casually. Confidence on recommendations, with the `%` sign.
- **A model's account of its own context is not a witness.** Asked to quote every hook line in
  its context, a Haiku session quoted one of two; the hook had emitted both. Witness context
  injection with a `tee` to a file from inside the hook, then read the file. Note that Claude
  Code prefixes the first stdout line with `SessionStart:<matcher> hook success:`, so test
  "contains", not "begins with". *(First new-session test of `bin/wake`, 2026-09-07.)*

## Purge branches by PR record, not by ancestry (2026-09-09)

A repo that squash-merges leaves every PR branch's commits OUTSIDE main's ancestry, so
`git branch --merged` and `merge-base --is-ancestor` call a merged branch "unique work". And
if the remote copies are deleted first, the "local equals its remote" test stops seeing them
too — the coach repo's first local pass kept 427 branches as "unpushed", of which 425 were
merged-PR heads and the other two had zero unique patches by `git cherry`.

**Also:** `git branch -r` counts EVERY `refs/remotes/*` namespace, including leftovers of
an old pull-request refspec (`refs/remotes/pr/*`) that no `fetch --prune` will ever touch
because no such remote exists. The coach repo's "1,576 remote branches" were 8 on GitHub
plus 1,030 of those. Read `git ls-remote --heads origin` before calling anything a remote
branch, and delete stale local refs with `git update-ref --stdin` (one ref per invocation
otherwise).

**How to apply:** classify by the PR record first (`gh pr list --state merged/closed --json
headRefName`, paginated), then by `git cherry <main> <branch>` for the residue (zero `+` lines
means main already holds every patch), and only then by ancestry. Run the local pass BEFORE
the remote one, or keep the PR-head list from before the remote deletion. Bulk deletion is the
approver's hand: the harness classifier refuses mass `push --delete` / `branch -D` from the
chair, and a script wrapper would be a workaround — write the script, explain each class in
its header, and hand over the command.
