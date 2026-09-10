Repo: <owner/repo> (main checkout <path> — never touch it; you are in your own worktree).
Issue #<n> — read it first, plus <the PRs/DACIs it depends on, each with its state as read
today>. Branch from current `origin/main`: `<type>/<n>-<slug>`. Open a PR; never merge.

The defect / the ask, verbatim from the ticket: <quote>.

Verify before editing (line numbers below were read from `origin/main` today): <the files,
functions and claims to check; what to do if one is false>.

How to work it: <numbered steps, each with the house law it serves>.

Witnesses: <one per behaviour, plus a control that the ordinary case is byte-identical>.
Mutation: revert <the fix> and <which tests> must red.

Gate, exit read from the file: `<GATE> > <unique scratch path>/check.log 2>&1; echo exit=$?`;
integration tier <required or not, and why>; label the PR if CI must run it. Rebase onto
`origin/main` right before you push. Conventional commit `<type>(<scope>): #<n> …` ending with
the attribution trailer; PR body: `Closes #<n>`, `Part of #<epic>`, what moved, the witnesses,
gate numbers, ends with the generated-with line; never `git stash`, never commit agent memory.
Reply here with: PR number, head sha, gate exit and passed count, and <the one-line answers
the chair needs>.
