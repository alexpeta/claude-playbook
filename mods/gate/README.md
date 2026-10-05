# gate

The CI gate, run by Claude Code itself instead of through a shell line the model writes. The
model calls one tool with a checkout's path; the mod runs the gate there with no shell and no
pipe, reads the verdict from the exit code held to the exit file, and answers in a few lines:
the stages and their times, and for a red gate the failing stage's last 60 lines. The person
runs the same with `/gate` and keeps the prompt.

```
exit=1 · failed at lint (stage 2 of 7) · 12s · feat/b1 @ 55bd4e0, with uncommitted changes
typecheck 6s · lint 5s
log: <repo>/.git/worktrees/b1/gate.log

--- the last lines of lint ---
src/gate-probe.ts
  2:3  error  Unexpected 'debugger' statement  no-debugger
```

The status line follows it: `gate ⠹ test 6/7 · 1m48s · b1 · builder` while it runs, then
`gate ✓ b1 @ bbb2222 · 1m16s`, `gate ✗ lint · b1 @ 55bd4e0`, and `· stale` once HEAD moves.

## Install

Once per machine, after the playbook's marketplace is added (README → Mods):

    claude plugin install gate@claude-playbook

Mods need Claude Code 2.1.287 or later. Turn it off in `/plugin`, Installed tab.

## Per repo

Two variables, read from the environment, so a project's `.claude/settings.json` `env` sets them:

| Variable | Default | What it is |
| --- | --- | --- |
| `CLAUDE_GATE_COMMAND` | `pnpm gate` | the gate, run by argv with no shell |
| `CLAUDE_GATE_EXIT_VAR` | `GATE_EXIT_FILE` | the variable the gate writes `exit=<code>` to; empty when it writes none, and the exit code alone is the verdict |

A gate that prints `== gate: <stage>` lines (one per stage, then `<stage> failed (exit <n>)` or
`all stages passed`) gets per-stage progress and times; any other gate is one stage.

## What it does

- **The verdict is never prose.** The exit code, held to the exit file: if the gate wrote none,
  or the two disagree on pass or fail, the verdict is `exit=?` with the reason, and never green.
  The exit file and the whole log go in the checkout's git folder (`gate.exit`, `gate.log`),
  never in the tree.
- **Guards, each refusal naming the right form:**
  - the gate piped into another command, run without its exit variable, or chained to a push;
  - while a gate runs: edits (`Edit`, `Write`, `NotebookEdit`) and tree moves (`git switch`,
    `stash`, `rebase`, `reset`, `commit`, …) in that checkout, and a second gate there;
  - a push when that checkout's last gate is red, unread or missing. Only a repo that has passed
    a gate under the mod is guarded, so a repo with no gate never is. A green gate on an older
    commit lets the push through with a note naming both commits: builders rebase right before
    they push, and CI checks the difference.
- **A command, not a mention.** The guards read the line the shell runs: a heredoc's body is
  dropped, each quoted string is one word, and a gate or a push counts only where a command
  starts. A commit message, an echo, a grep or a file written that names them is left alone.
- **What it cannot see, it says.** A shell line names its checkout by `cd <abs>` or `git -C
  <abs>`; a subagent's line with neither may run in a worktree no event reports, so its push goes
  through with a note that it was not checked, and its gate is not recorded.
- **A gate run correctly through Bash still counts:** the mod reads the exit file the command
  names and records it.
- **The ledger:** one line per run in `~/.claude/gate-runs.jsonl` (the repo, the checkout, the
  branch and commit, the agent, how it ran, the verdict, each stage's time), beside the call
  cap's `builder-calls.jsonl`. Which stage is slow, which fails most, is read there.
- **State.** The gates running now are the session's own; the last verdict per checkout, the
  repos armed for the push guard and each repo's stage count are kept in the mod's store across
  sessions. No model call, no network.

## Develop

    claude --plugin-dir mods/gate          # loads it for one session, reloads on save
    claude plugin validate mods/gate
    claude plugin test mods/gate           # 13 tests
    tsc -p mods/gate                       # once Claude Code has loaded it: it writes the tsconfig

The tests were mutation-checked on 2026-10-05: twenty-three deliberate breaks (the exit file's
say, each guard, the push guard's arming, record, red, unread and moved-commit cases, the
subagent note, the stage tail, the stage count, staleness, the live stage, the environment, the
Bash record, the ledger, and each of the three rules that tell a command from a mention) each
turned a test red.
