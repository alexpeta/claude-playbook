# Chair and builders — the operating model

One seat holds strategy, QC and the merge line; builder agents do the implementation. This is
the shape that let one person and one chair ship a dozen reviewed PRs and six releases in a
morning without a false green.

## Seats

- **Approver (the human).** Owns decisions: DACIs, product laws, user-facing behaviour,
  data deletion, prod writes. Merges decision documents by hand — approval *is* ratification.
- **Chair (the top-tier model, e.g. Fable/Opus-class).** Technical strategy partner. Writes the
  DACIs, slices epics, briefs builders, QC-reads every PR, reruns the unit gate with its own
  hands, runs the merge line under a standing grant, keeps the ledger, files the boyscout
  tickets. Does not implement slices itself except chair tooling and docs.
- **Builders (Opus-class, one per slice, `isolation: worktree`, `model` passed explicitly —
  the Agent tool inherits the session model when it is omitted; burned four times, and a fifth
  on 2026-09-16 when a reader and a docs lookup went out with no `model` and ran on the chair's
  tier. The rule is every Agent call, not only builders: name the model, and a project agent
  definition's `model:` line only binds when that agent type is the one dispatched).** Verify the
  brief against the repo, build, gate, open the PR, never merge. Keep their own craft memory.
- **Readers (Haiku-class; or a non-Claude model on the project's own key when the plan bar,
  not the dollar, is the constraint).** Turn bulk text into STRUCTURE WITH LOCATIONS: a
  diff index (functions added/removed with line ranges, tests deleted by name, event keys,
  census pins), a decision digest of a DACI or a held PR for a brief, a log-tail triage, a
  corpus scan. They never judge, never edit, and never stand in for the read that gates or
  edits — the chair reads the hunks it gates on and the builder reads the lines it edits
  ("quote the read", one seat up). Worth it where a read is orientation and its output would
  otherwise ride the rest of a long context: the chair's PR intake, the first twenty calls
  of a build. Not a hook on file size: measured 2026-09-14, builders already trim, and 6 of
  1,306 results were over 350 lines. Recipe: `recipes/reader-tier.md`.

## The loop for non-trivial work

1. **Plan** together; a real fork gets a DACI first (`templates/daci.md`): Driver writes
   Background & Scope, Options with a comparison table, a recommendation; Approver decides;
   the decision and rationale are recorded in the doc; amendments are appended later, dated.
2. **Slice** into an epic with native GitHub sub-issues (not just "Part of #N" text); every
   slice on the board with Status = Backlog. The ticket number is the only id.
3. **Dispatch** a builder per slice. The brief (`templates/dispatch-brief.md`) is written from
   `origin/main` at dispatch time, names line numbers as of that read, quotes the ticket's ask
   verbatim, lists what to verify before editing, names the witnesses, the gate command, the
   PR body shape, and the reply shape. Board: In progress. **Scope a dispatch to about 400
   tool calls of work.** A builder re-sends its whole context on every call, so a build's
   cost grows with the square of its length (`lessons.md` → Builder cost is calls × context).
   A slice that needs more is dispatched as phases — read and plan, build, gate and verify —
   each a fresh context, joined by a written handoff (what was decided, what moved, what is
   left) that the next phase's brief quotes.
   Enforce the cap with a PreToolUse hook that counts calls per `agent_id` for the builder
   agent type only, warns the model through PostToolUse context near the cap, and past it
   denies everything but handoff-shaped calls (a write under the scratch path, `git
   add|commit|push`); a SubagentStop hook that appends one line per build is the free
   measurement of every build's length. The hook enforces, the instruction explains.
   Shipped: `hooks/call-cap.py` + `templates/settings.json`, placed by `bin/init`.
4. **Build.** Branch `<type>/<issue>-<kebab-title>` off `origin/main`; conventional commit
   `<type>(<scope>): #<issue> <title>` with the harness's attribution trailer; gate with the exit
   code read from a file; integration tier when a DB path moves (label the PR so CI runs it);
   rebase onto `origin/main` right before pushing; PR body: `Closes #<slice>` and
   `Part of #<epic>` — never `Closes #<epic>`; a "Where the brief was wrong" section at the top
   when the repo contradicted the brief. Board: In review.
5. **QC.** The chair reads the diff (not the summary), writes a dated QC comment ON THE PR
   (never the ticket): what was read, what was verified beyond the builder's tests, each gate
   leg with its numbers, the found-not-fixed items and the tickets they became. Then reruns the
   unit gate on the PR's exact head in the main tree. Re-gate on any new head, always.
   QC checklist, minted 2026-09-07: any date, time or weekday a test derives — literal or
   live — must come from the clock AND the day function the code under test reads. A future
   literal that becomes past mid-day, or a weekday keyed on the UTC date while the code
   resolves a floored local day, turns every gate red with no change to blame.
6. **Merge line.** A coordinator (`recipes/merge-coordinator.md`) merges one PR per release:
   greens first; a preview gate of the PR merged onto current main; merge; wait for the release
   tag AND the health endpoint to report it; then the next. Merges faster than the runner's drain
   rate release nothing.
7. **Ledger.** One line per event in an append-only run ledger (memory), timestamps read off the
   clock. Heartbeats answer in one line from it. A morning digest reads from it.
8. **Retro** at the end of a run (`templates/retro.md`): what worked, what did not, rules
   adopted (saved as memory), tomorrow.

## Experiments before decisions

A decision record describes the shipped product. It is not a wall: a contributor who wants to
try something does not need it amended first, and a Claude that refuses a change because "this
was decided" has mistaken the record for the law. The ladder between an idea and a decision:

1. **Idea.** An issue with the hypothesis in one line and what "worked" would look like. No
   approval to start.
2. **POC.** A PR behind a switch, default off. With the switch off the shipped product is the
   ratified one, byte for byte where a render can be pinned. QC and merge as any execution PR.
3. **Experiment.** Run on the deployed copy. The verdict, dated, on the experiment's file: keep,
   change (back to 2) or drop.
4. **Decision.** Keep → a decision record (an amendment to the one it challenged is enough) and
   the switch comes out. Drop → the code comes out and the file says why.

Rules that make it hold:

- **An experiment may challenge any ratified decision**, behind its switch, with no amendment
  until it is kept. Its file names what it challenges in one line, so the reader of that record
  can find the open challenge.
- **Laws are not decisions.** The ways of working and the repo's mechanics (the gate, the pure
  engine, one PR per change) are not up for an experiment; an experiment lives inside them.
- **One file per experiment**, `docs/experiments/NNNN-<slug>.md`, numbered and never renumbered,
  on `templates/experiment.md`, started in the POC's PR. The product's living design doc keeps
  describing the shipped product only.
- **Tooling is not an experiment.** A testing switch, a cheat, a debug panel stays what it is.
  A switch that tries a change to the product is an experiment, wherever it is drawn.
- **Evidence is named up front.** Anything that touches the core names a measurement; anything
  that touches only the screen names who plays it and for how long. "It feels better" is an
  allowed verdict, written down as that.
- **The chair looks at the running list weekly** and nudges any experiment older than a
  fortnight with no verdict.

*(2026-09-17: four PRs from a contributor shipped rule and look changes to every player with no
flag, one of them with a decision record written at the idea stage, and the contributor's Claude
refused a later change on the strength of an older record. The approver's framing: "we assume
something in the past, now we're trying to challenge that — but we don't need to go ahead and do
the amendment.")*

## Grants

The approver gives grants explicitly and dated; this section records them. The ones below are
the author's, standing across their projects since 2026-09-07 (given in chat: the chair may
merge PRs; DACIs wait for the user; builder-opened PRs the chair QC-reads and then merges).
Before that date each grant was given per project; ops grants still are.

- **Merge grant.** The chair merges execution PRs — its own, builders', and **any author's**,
  the approver's own hand-rolled ones included (extended 2026-09-15: "a PR is a PR, doesn't
  matter who opened it … I expect you to help me gate it and keep me honest, you are the
  gatekeeper") — under triple-green (builder gate, CI per check, the chair's own unit-gate
  rerun) plus the dated QC comment on the PR. CI green is the second green; the chair's
  rerun is optional where CI ran the same command on the same sha (2026-09-15, a repo whose
  CI is the gate command itself on a self-hosted runner), and stays required where CI runs
  less than the gate does. Where a repo has no gate or CI (docs-only), the QC read is the condition. Decision
  documents (DACIs) wait for the approver's click; approval *is* ratification.
- Ruling delegation at ≥ 80 % confidence; below that, options and a lean.
- Pacing of dispatch is the chair's: to the runner queue and the merge line, not to a fixed
  count of agents in flight. On one laptop, at most two integration tiers run at once; a
  third waits (load average 18 and a 2× slower CI, 2026-09-07).
- Ops grants (restart a runner, cancel a wedged run, prune a store) are per project, explicit
  and logged.

## What the builder definition must carry

See `agents/builder.md`. The load-bearing bullets: verify the brief's claims before building;
gate exit from a file, never from stage prose; never `git stash`; never mutate the tree while a
gate runs; scratch under a run-unique path; keyless CI reproduction; `Closes` the slice not the
epic; surface ambiguity in the PR body instead of resolving it silently; write durable craft to
memory, not task specifics.

## Where the harness lives

Five layers, one criterion (ratified 2026-09-08 on a production repo, from a retro item asking
whether to track builder memory):

| layer | examples | home | versioned |
|---|---|---|---|
| code | the package, tests | the repo | yes |
| record | docs, decisions, RCAs, retros | the repo | yes |
| repo-bound harness | agent definitions, builder memory, the chair's gate and coordinator scripts, the QC comment template | the repo, under `.claude/` | yes — committed only by the chair |
| operational state | merge queue, comment files, the run ledger, the chair's own memory, heartbeats | the machine | no, by design |
| playbook | laws, templates, lessons true of any repo | this repo | yes |

- **The criterion is staleness, not "product vs metadata".** Whatever goes stale when the code
  moves — a memory file naming a fixture, an agent definition naming the gate command, a
  coordinator encoding the release mechanics — lives with the code, in the same commit
  history. CI workflows and the project `CLAUDE.md` were already there for the same reason.
  A separate harness repo drifts, costs two PRs per change, and breaks the one mechanism
  that makes tracked memory worth anything: a fresh worktree inherits it.
- **Draw the product boundary explicitly.** If the image is built with `COPY . .`, add a
  `.dockerignore` for `.claude/` (and `docs/`) BEFORE tracking anything under it — one repo
  shipped its docs, tests and agent definition in every image until someone read the
  Dockerfile.
- **Builders keep no memory; two layers hold what a build learns, and nothing else.** A lesson
  true of any repo goes to `lessons.md` the same day, with its incident; a mechanic of this repo's
  tooling that still bites (the gate's exit-file rule, a guard's refused shell shapes, a flag)
  goes into the builder agent file's short list, which is edited, never appended; a time-bound
  item (found-not-fixed, a fixture that lied once, a brief that was wrong) lives on its ticket or
  PR body and is kept nowhere. No `memory:` on the builder, no harvest PRs. *(Retired 2026-09-24:
  46 harvest PRs, 94 memory files (428 KB) and a 148 KB agent file loaded into every one of 86
  dispatches, ~37k tokens each, with the worth never measured — the approver: "we harvest rules,
  general not specific to the project, and … timebound action items … it has become a well of text
  and sunk cost".)*
- **Operational state decays on purpose; promote its residue.** Rulings go to tickets and
  decision documents, repo mechanics to the builder agent file's short list, transferable
  lessons here.
