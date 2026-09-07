# claude-playbook

How Alex and Claude work together, written down so a new project — or a fresh session with no
memory of the last one — starts where the previous one left off instead of re-learning it.

Three kinds of content, kept apart on purpose:

| file | what it holds | when to read it |
|---|---|---|
| [`ways-of-working.md`](ways-of-working.md) | the laws: how to think, build, verify, disagree, and report | first, every time |
| [`chair-and-builders.md`](chair-and-builders.md) | the operating model: one strategy-and-QC seat, Opus builders in worktrees, gates, PRs, a merge line, a board, DACIs | before the first dispatch on a project |
| [`lessons.md`](lessons.md) | mechanics that cost real work once, each with the incident that earned it | when something feels off; and skim before an unattended run |
| [`agents/`](agents/) | agent definitions to copy into a project's `.claude/agents/` | when setting up builders |
| [`templates/`](templates/) | a starter `CLAUDE.md`, the DACI, retro, dispatch-brief and QC-comment shapes | when starting a project, a decision, a brief |
| [`recipes/`](recipes/) | how-tos that are tool-shaped rather than law-shaped (merge coordinator, board via `gh`, masked SSH) | when you need the mechanism |

## Starting a new project

1. Copy `templates/CLAUDE.md` to the repo root and fill in the gate command and the repo-specific
   mechanics section; delete anything that is not true of the new repo. A CLAUDE.md that lies
   is worse than none.
2. Copy `agents/builder.md` to `.claude/agents/<name>.md`; set the gate command and the repo's
   own laws in it.
3. Create `docs/decisions/` and `docs/retros/`; the first real fork gets `0001-<slug>.md` from
   `templates/daci.md`.
4. Read `ways-of-working.md` and `lessons.md` once, end to end. They are short on purpose.

## Origin

Distilled on 2026-09-07 from the `fitness-coach-agent` (Coach Apex) project's `CLAUDE.md`, its
builder definition, 150+ DACIs, and the chair's memory notes — after a run that merged 12 PRs and
shipped 6 releases in a morning under these rules. Repo-specific details (gate commands, hosts,
schema names) stay in the project; what is here is the part that transfers.

Rule for editing this repo: a practice earns its line by an incident or a decision, both named.
Amend freely (decisions are tracer bullets); never delete the incident that minted a rule.
