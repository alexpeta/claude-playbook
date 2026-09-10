# Recipe — the merge coordinator

A shell loop that drains a queue of QC-green PRs one release at a time. The pattern, not the
script; the script is repo-specific.

**Queue file**, one line per PR: `<PR> <ISSUE> <COMMENT_FILE>`; a merged line becomes
`# MERGED …`, a parked one `# PARKED(<reason>) …`. The chair's gate script appends a line only
on its own green exit; the coordinator never gates a PR the chair has not.

**One lap:**
1. `ensure_main_released`: the newest tag on `origin/main` must be deployed (health endpoint
   reports it) before anything merges — a merge onto an unreleased main makes the pending
   release fail "upstream changed". Non-releasable commits (`chore:`/`docs:`/`ci:`) mint no tag;
   don't wait on them.
2. **Greens first:** promote the first PR whose CI is already settled green to the head; a
   PR whose CI is pending rotates to the end (a lap is ~15 min); a cancelled run is re-run only
   when nothing green is waiting.
3. **Check buckets take the best across a head's several check runs** — a label add or a
   re-run leaves a superseded run whose checks read "skipped"/"cancelled".
4. **Stale-head rule:** the chair's gate exit file must match the PR's current head, or the
   line is parked for a re-gate.
5. **Preview gate:** under a tree lock, `checkout --detach origin/main`, merge the PR branch,
   run the full gate keyless, exit from a file. A conflict parks the PR `(rebase)`; a red parks
   it `(preview-red)`. A branch green on its own base can still break main.
6. Fill the comment tokens (`__HEAD__ __EXIT__ __USUM__ __COV__ __CI__ __INTEG__ __PREVIEW__
   __STAMP__`), post the comment, squash-merge with branch delete.
7. **Wait for the release:** poll every 180 s for a NEW tag on `origin/main` that contains the
   merged sha AND the health endpoint reporting that tag. Verified without the Actions API.
   Deploy green → next line; unverified after N hours → stop the queue for the chair.
8. Queue empty → exit; the chair restarts it when the next PR is queued.

**Known limits:** docs-only PRs run no checks and are invisible to the CI read (merge those by
hand); the loop takes the tree lock, so no interactive checkout in the main tree while it runs.
