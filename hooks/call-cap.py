#!/usr/bin/env python3
"""The builder call cap (2026-09-14). A Claude Code hook: one JSON event on stdin.

Why: five builds measured from their transcripts put 91 % of their price in cache re-reads —
every tool call re-sends the whole context, so a build's cost grows with the square of its
length. A 362-call build cost a sixth of a 1,300-call one at the same QC bar. The playbook
scopes a dispatch to ~400 calls; this hook is the counter a builder cannot keep for itself.

Applies ONLY to subagents whose `agent_type` is in CAPPED_AGENTS — the env
`CLAUDE_CALL_CAP_AGENTS`, comma-separated, default `builder` (the playbook's agent name; a repo
that renamed its builder sets the env in the hook command). The chair's session and the readers
are untouched. Counts PreToolUse events per `agent_id` in a file under
/tmp (operational state; never in the repo).

  * below WARN_AT: silent.
  * WARN_AT..CAP-1: PostToolUse `additionalContext` every WARN_EVERY calls — "write the handoff".
  * CAP..CAP+GRACE: PreToolUse DENIES everything except a handoff-shaped call — a Write/Edit
    under a scratchpad path, or a Bash command that is `git add|commit|push|status|log|
    rev-parse|diff` or writes into a scratchpad path — so the builder can record what it
    decided, what moved, what is left and the head sha, commit and push, and report.
  * past CAP+GRACE: everything denied (a runaway).
  * SubagentStop: one JSON line to ~/.claude/builder-calls.jsonl (the measurement:
    calls by tool, capped or not), then the counter file is removed.

Never breaks a build: any error → exit 0 with no output. Self-test: `call-cap.py --self-test`.
"""
import json, os, re, sys, tempfile, time

CAPPED_AGENTS = set(filter(None, os.environ.get("CLAUDE_CALL_CAP_AGENTS", "builder").split(",")))
CAP = int(os.environ.get("CLAUDE_CALL_CAP", "400"))
GRACE = int(os.environ.get("CLAUDE_CALL_CAP_GRACE", "25"))
WARN_AT = int(os.environ.get("CLAUDE_CALL_CAP_WARN_AT", "360"))
WARN_EVERY = 20
STATE_DIR = os.path.join(tempfile.gettempdir(), "claude-call-cap")
LEDGER = os.path.expanduser(os.environ.get("CLAUDE_CALL_CAP_LEDGER", "~/.claude/builder-calls.jsonl"))
_GIT_OK = re.compile(r"^\s*(cd\s+\S+\s*(&&|;)\s*)?git\s+(add|commit|push|status|log|rev-parse|diff|branch\s+--show-current)\b")


def _path(agent_id):
    return os.path.join(STATE_DIR, re.sub(r"[^A-Za-z0-9_-]", "_", agent_id) + ".json")


def _load(agent_id):
    try:
        with open(_path(agent_id)) as f:
            return json.load(f)
    except Exception:
        return {"calls": 0, "by_tool": {}, "first": time.time(), "capped": False}


def _save(agent_id, st):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = _path(agent_id) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(st, f)
    os.replace(tmp, _path(agent_id))


def _handoff_shaped(tool, inp):
    if tool in ("Write", "Edit", "MultiEdit"):
        return "scratchpad" in str(inp.get("file_path", ""))
    if tool == "Bash":
        cmd = str(inp.get("command", ""))
        return bool(_GIT_OK.match(cmd)) or "scratchpad" in cmd
    return False


def _handoff_reason(n):
    return (
        f"CALL CAP: this is tool call {n} of a dispatch scoped to {CAP} (the builder definition's call cap, "
        "2026-09-14 — every call re-sends your whole context, so the build's cost is now growing with the "
        "square of its length). Stop building. Do exactly this, in this order: (1) write a HANDOFF to your "
        "scratch path (`…/scratchpad/<ticket>/handoff.md`): what was decided and why, what moved (files, "
        "functions, tests), what is left, the gate/tier state, and the head sha; (2) `git add` + `git commit` "
        "what is committable and `git push`; (3) reply with the handoff path and the head sha. Only "
        "handoff-shaped calls are allowed now: Write/Edit under a scratchpad path, and `git add|commit|push|"
        "status|log|rev-parse|diff`. The chair dispatches the next phase into a fresh context."
    )


def main():
    raw = sys.stdin.read()
    ev = json.loads(raw) if raw.strip() else {}
    agent_id = ev.get("agent_id")
    if not agent_id or ev.get("agent_type") not in CAPPED_AGENTS:
        return
    event = ev.get("hook_event_name")
    st = _load(agent_id)
    if event == "PreToolUse":
        st["calls"] += 1
        n = st["calls"]
        tool = ev.get("tool_name", "?")
        st["by_tool"][tool] = st["by_tool"].get(tool, 0) + 1
        if n >= CAP:
            st["capped"] = True
            allowed = n <= CAP + GRACE and _handoff_shaped(tool, ev.get("tool_input") or {})
            _save(agent_id, st)
            if not allowed:
                reason = _handoff_reason(n) if n <= CAP + GRACE else (
                    f"CALL CAP EXCEEDED: {n} calls, {GRACE} past the {CAP} cap. Every call is denied now. "
                    "Reply with what you have: the handoff path if you wrote one, the head sha, and what is left."
                )
                print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}))
            return
        _save(agent_id, st)
    elif event == "PostToolUse":
        n = st["calls"]
        if WARN_AT <= n < CAP and (n - WARN_AT) % WARN_EVERY == 0:
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": (
                f"CALL CAP WARNING: tool call {n} of {CAP}. Finish the current step and write the handoff "
                "(decided / moved / left / head sha) to your scratch path before call " + str(CAP) + "; "
                "past it only handoff-shaped calls are allowed."
            )}}))
    elif event == "SubagentStop":
        line = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "agent_id": agent_id, "agent_type": ev.get("agent_type"),
                "calls": st["calls"], "by_tool": st["by_tool"], "capped": st["capped"], "minutes": round((time.time() - st.get("first", time.time())) / 60, 1)}
        os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
        with open(LEDGER, "a") as f:
            f.write(json.dumps(line) + "\n")
        try:
            os.remove(_path(agent_id))
        except Exception:
            pass


def _self_test():
    import subprocess
    me = os.path.abspath(__file__)
    env = dict(os.environ, CLAUDE_CALL_CAP="5", CLAUDE_CALL_CAP_GRACE="2", CLAUDE_CALL_CAP_WARN_AT="3", TMPDIR=tempfile.mkdtemp())
    aid = "selftest-" + str(int(time.time()))
    def run(ev):
        p = subprocess.run([sys.executable, me], input=json.dumps(ev), capture_output=True, text=True, env=env)
        assert p.returncode == 0, p.stderr
        return json.loads(p.stdout) if p.stdout.strip() else {}
    pre = lambda tool, inp: run({"hook_event_name": "PreToolUse", "agent_id": aid, "agent_type": "builder", "tool_name": tool, "tool_input": inp})
    post = lambda: run({"hook_event_name": "PostToolUse", "agent_id": aid, "agent_type": "builder", "tool_name": "Bash", "tool_input": {}})
    assert run({"hook_event_name": "PreToolUse", "agent_type": "Explore", "agent_id": "x", "tool_name": "Read", "tool_input": {}}) == {}, "a reader must be untouched"
    assert run({"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {}}) == {}, "the main session must be untouched"
    assert pre("Bash", {"command": "ls"}) == {} and post() == {}          # 1
    assert pre("Bash", {"command": "ls"}) == {} and post() == {}          # 2
    assert pre("Bash", {"command": "ls"}) == {}                            # 3 → warn
    assert "CALL CAP WARNING" in post()["hookSpecificOutput"]["additionalContext"]
    assert pre("Bash", {"command": "ls"}) == {}                            # 4
    d = pre("Bash", {"command": "poetry run pytest"})                      # 5 = cap → deny
    assert d["hookSpecificOutput"]["permissionDecision"] == "deny" and "HANDOFF" in d["hookSpecificOutput"]["permissionDecisionReason"]
    assert pre("Write", {"file_path": "/tmp/x/scratchpad/2684/handoff.md", "content": "x"}) == {}   # 6: handoff allowed
    assert pre("Bash", {"command": "git add -A && git commit -m x && git push"}) == {}               # 7: git allowed (cap+2 = grace edge)
    d = pre("Bash", {"command": "git status"})                                                      # 8: past grace → denied
    assert d["hookSpecificOutput"]["permissionDecision"] == "deny" and "EXCEEDED" in d["hookSpecificOutput"]["permissionDecisionReason"]
    env["HOME"] = env["TMPDIR"]
    run({"hook_event_name": "SubagentStop", "agent_id": aid, "agent_type": "builder"})
    led = open(os.path.join(env["TMPDIR"], ".claude", "builder-calls.jsonl")).read().strip().splitlines()
    rec = json.loads(led[-1]); assert rec["calls"] == 8 and rec["capped"] is True and rec["by_tool"]["Bash"] == 7, rec
    print("self-test OK: reader/main untouched; warn at 3; deny at 5; handoff Write + git allowed through grace; hard deny after; ledger line", rec["calls"], "calls")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        try:
            main()
        except Exception:
            pass
        sys.exit(0)
