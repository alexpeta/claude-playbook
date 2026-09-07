# claude-playbook

How Alex and Claude work together, written down so a new project — or a fresh session with no
memory of the last one — starts where the previous one left off instead of re-learning it.

The index is [`llms.txt`](llms.txt): what each file holds and when to read it. The laws are
[`ways-of-working.md`](ways-of-working.md); the operating model is
[`chair-and-builders.md`](chair-and-builders.md); the incidents are [`lessons.md`](lessons.md).

## How a session gets it

Every Claude Code session on the machine wakes with the playbook, without a step Claude has to
remember to take:

- `~/.claude/CLAUDE.md` imports `llms.txt` and `ways-of-working.md` (one `@path` line each), so
  the index and the laws are in context before the first prompt. Context is not enforcement,
  so the laws are the text of the file, not a pointer to it.
- A `SessionStart` hook runs [`bin/wake`](bin/wake), which prints two `[playbook]` lines: the
  playbook's path, commit and distance from `origin`, and whether the current repo is
  bootstrapped. A hook runs whatever Claude decides, so state comes from the hook and text
  from the import.

Once per machine:

    git clone https://github.com/alexpeta/claude-playbook.git ~/Github/claude-playbook
    ~/Github/claude-playbook/bin/install

`bin/install` is idempotent: it keeps the two import lines inside a marked block in
`~/.claude/CLAUDE.md` and merges the hook into `~/.claude/settings.json`, backing the file up
first. Rerun it after moving the clone. To verify from the terminal, run this in an empty git
repo; it should return two lines, the second saying the repo is not bootstrapped:

    claude -p "quote every line in your context that contains [playbook]"

### Windows

Native Windows works with [Git for Windows](https://git-scm.com/downloads/win) installed:
Claude Code runs hooks and its Bash tool through Git Bash, and the three scripts are bash.
`bin/install` needs Python 3 for the JSON merge (`python3`, `python`, or `py -3`); without it,
install prints the hook entry to paste by hand. From Git Bash:

    git clone https://github.com/alexpeta/claude-playbook.git ~/Github/claude-playbook
    bash ~/Github/claude-playbook/bin/install

Config lives in `%USERPROFILE%\.claude`, which Git Bash sees as `~/.claude`; the paths written
into it are Windows-native (`C:/Users/...`). WSL is Linux: follow the instructions above inside
the distro. Untested on a Windows machine as of 2026-09-07; the first run there is the test.

## Starting a new project

From the new repo's root, `~/Github/claude-playbook/bin/init`. It copies `templates/CLAUDE.md`
to `CLAUDE.md` and `agents/builder.md` to `.claude/agents/builder.md`, creates
`docs/decisions/` and `docs/retros/`, never overwrites, and lists the placeholders left to
fill. Then:

1. Fill the gate command and the repo-specific mechanics section of `CLAUDE.md`; delete
   anything that is not true of the new repo. A CLAUDE.md that lies is worse than none.
2. Set the gate command and the repo's own laws in `.claude/agents/builder.md`.
3. The first real fork gets `docs/decisions/0001-<slug>.md` from `templates/daci.md`.
4. Read `ways-of-working.md` and `lessons.md` once, end to end. They are short on purpose.

## Origin

Distilled on 2026-09-07 from the `fitness-coach-agent` (Coach Apex) project's `CLAUDE.md`, its
builder definition, 150+ DACIs, and the chair's memory notes — after a run that merged 12 PRs and
shipped 6 releases in a morning under these rules. Repo-specific details (gate commands, hosts,
schema names) stay in the project; what is here is the part that transfers.

## Rules for editing this repo (Alex, 2026-09-07)

- **Project specifics stay out.** Gate commands, hosts, schema names, ticket numbers as
  identifiers, credentials of any kind: none of it. What is here must be true of a repo it
  has never seen. (Incidents may be named by their ticket number for traceability; the
  lesson must stand without following the link.)
- **A lesson learned in a project that can be generalized to benefit future us goes in
  here** — the same day it is minted, in the file it belongs to, with the incident that
  earned it. If it cannot be generalized, it belongs in that project's `CLAUDE.md` or
  memory, not here.
- A practice earns its line by an incident or a decision, both named. Amend freely
  (decisions are tracer bullets); never delete the incident that minted a rule.
