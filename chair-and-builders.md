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
  the Agent tool inherits the session model when it is omitted; burned four times).** Verify the
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

## Grants

The approver gives grants explicitly and dated; this section records them. The ones below are
the author's, standing across their projects since 2026-09-07 (given in chat: the chair may
merge PRs; DACIs wait for the user; builder-opened PRs the chair QC-reads and then merges).
Before that date each grant was given per project; ops grants still are.

- **Merge grant.** The chair merges execution PRs — its own and builders' — under triple-green
  (builder gate, CI per check, the chair's own unit-gate rerun) plus the dated QC comment on
  the PR. Where a repo has no gate or CI (docs-only), the QC read is the condition. Decision
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
- **Builders never commit memory in feature PRs.** The chair harvests new files from a
  worktree before removing it and commits them in a `chore(harness)` PR; a consolidation
  pass merges duplicate families (a fresh-worktree builder re-learns the same gate mechanics
  every run until the store is inherited).
- **Operational state decays on purpose; promote its residue.** Rulings go to tickets and
  decision documents, repo craft to builder memory, transferable lessons here.
