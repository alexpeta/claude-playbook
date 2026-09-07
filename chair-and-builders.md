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

## The loop for non-trivial work

1. **Plan** together; a real fork gets a DACI first (`templates/daci.md`): Driver writes
   Background & Scope, Options with a comparison table, a recommendation; Approver decides;
   the decision and rationale are recorded in the doc; amendments are appended later, dated.
2. **Slice** into an epic with native GitHub sub-issues (not just "Part of #N" text); every
   slice on the board with Status = Backlog. The ticket number is the only id.
3. **Dispatch** a builder per slice. The brief (`templates/dispatch-brief.md`) is written from
   `origin/main` at dispatch time, names line numbers as of that read, quotes the ticket's ask
   verbatim, lists what to verify before editing, names the witnesses, the gate command, the
   PR body shape, and the reply shape. Board: In progress.
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
6. **Merge line.** A coordinator (`recipes/merge-coordinator.md`) merges one PR per release:
   greens first; a preview gate of the PR merged onto current main; merge; wait for the release
   tag AND the health endpoint to report it; then the next. Merges faster than the runner's drain
   rate release nothing.
7. **Ledger.** One line per event in an append-only run ledger (memory), timestamps read off the
   clock. Heartbeats answer in one line from it. A morning digest reads from it.
8. **Retro** at the end of a run (`templates/retro.md`): what worked, what did not, rules
   adopted (saved as memory), tomorrow.

## Grants (each was given explicitly, dated; a new project needs its own)

- Merge grant for execution PRs under triple-green (builder gate, CI per check, the chair's own
  unit-gate rerun) plus the QC comment. Decision documents wait for the approver's click.
- Ruling delegation at ≥ 80 % confidence; below that, options and a lean.
- Pacing of dispatch is the chair's: to the runner queue and the merge line, not to a fixed
  count of agents in flight.
- Ops grants (restart a runner, cancel a wedged run, prune a store) are explicit and logged.

## What the builder definition must carry

See `agents/builder.md`. The load-bearing bullets: verify the brief's claims before building;
gate exit from a file, never from stage prose; never `git stash`; never mutate the tree while a
gate runs; scratch under a run-unique path; keyless CI reproduction; `Closes` the slice not the
epic; surface ambiguity in the PR body instead of resolving it silently; write durable craft to
memory, not task specifics.
