# cockpit

A band above the Claude Code prompt. The first line is the session: its model, the context
window, the rate-limit windows and what the session has cost. Under it, one row per live
subagent: its type, its model, its tool calls (against the builder cap, for the builder type),
how long it has run, and its task. A finished agent keeps its row for a minute, with a tick.

```
✻ Opus 5.5   ctx ━━━━━━━━━╸━━━━━━ 62% 124k/200k ▁▂▃▅▆   5h ━━━╸━━━━ 41% ↻2h10m   $3.10
  ├─ ⠹ builder  Opus 5.5   ━━━━━━━━╸━━━━━━━ 212/400     34m  slice-a
  └─ ✓ Explore  Haiku 4.5  17 calls                     <1m  list the decisions
```

## Install

Once per machine, from the playbook's clone (the marketplace reads the plugin in place, so a
`git pull` is the update, from the next session start):

    claude plugin marketplace add ~/Github/claude-playbook
    claude plugin install cockpit@claude-playbook

Mods need Claude Code 2.1.287 or later. Turn it off in `/plugin`, Installed tab.

## What it reads, and what it never does

- **The cap is mirrored, not enforced.** The builder count reads `CLAUDE_CALL_CAP_AGENTS`,
  `CLAUDE_CALL_CAP` and `CLAUDE_CALL_CAP_WARN_AT` with `hooks/call-cap.py`'s defaults
  (`builder`, 400, 360): the band shows the count, the hook stops the build. The count turns
  from green to yellow at the warning and red at the cap.
- **It only reads and draws.** `claude plugin validate mods/cockpit` lists its calls: the
  session's usage and model, the agent list, the clock, those three variables, its own state,
  and drawing. No file, process or network call, and it never approves or refuses a tool call.
- **Its state is session-local.** The counts live in `$.state` and die with the session (and
  with `/clear`, after which the figures are read again). The durable record of a build is the
  call-cap hook's ledger.
- **A figure Claude Code does not report is left out, never zeroed**: no context fill before
  the first response, no rate limits off a subscription. An agent that started before the band
  loaded is named with no model or count.
- **Colours are Claude Code's own theme keys** (`claude`, `permission`, `rate_limit_fill`,
  `success`, `warning`, `error`, `subtle`, and the subagent palette), read off the 2.1.289
  binary's theme tables, so the band follows the person's theme as `/usage` does.
- **Width decides the detail.** From 130 columns: every meter and the context sparkline (the
  fill after each turn, so a compaction shows as a drop). From 90: the context and builder
  meters. Below 90: the numbers.

## Develop

    claude --plugin-dir mods/cockpit        # loads it for one session, reloads on save
    claude plugin validate mods/cockpit
    claude plugin test mods/cockpit         # 7 tests, terminal and desktop surfaces
    tsc -p mods/cockpit                     # once Claude Code has loaded it: it writes the tsconfig

The tests were mutation-checked on 2026-10-04: twelve deliberate breaks (the count, the warning
and cap thresholds, the finished-agent window, the context colour, the reset clock, the width
tiers, the sparkline's scale and history, the capped type) each turned a test red.
