# Lessons — mechanics that cost real work once

Each entry: the rule, then the incident that minted it. Generalized; the project-specific
command lives in that project's `CLAUDE.md`.

## Gates and CI

- **Capture exit codes directly.** `check | tail` reports the pipe's status. Redirect to a
  file, then read `$?`; trust only the exit file — stage prose ("All checks passed!") has
  printed before the tests ran. *(A builder read "passed" twice while the chain exited 1.)*
- **CI is keyless.** No API keys in CI; a test that reaches a real LLM call passes locally on
  the developer's `.env` and crashes in CI. Stub the LLM constructor on any LLM-touching path;
  reproduce CI with the empty key exported (`KEY= run-the-gate`), not by moving `.env` —
  `find_dotenv()` walks UP out of worktrees and drinks the parent checkout's keys.
- **The unit gate is not the whole gate.** An integration tier that runs on a label or nightly
  is a blind spot for every local check; a symbol move that breaks only that tier passes
  everything you normally watch. Grep the integration tests too; never `head`-truncate a grep.
- **A tag or commit pushed with the workflow's own token starts no workflow.** GitHub does
  not create a run from an event that `GITHUB_TOKEN` caused (`workflow_dispatch` and
  `repository_dispatch` excepted), so a release job that tags with it can never fire an
  `on: push: tags` deploy. Hang the deploy off the release job's outputs in the same
  workflow; a PAT as a repo secret buys the event back at the price of a credential.
  *(2026-09-15: caught while briefing, before the dead trigger was written.)*
- **A conflicting PR gets no CI run at all.** GitHub cannot build the merge ref, so
  `synchronize`, `labeled`, `reopened` and empty commits all produce nothing. Check
  `mergeable` before chasing a missing run. *(2026-09-07: two hours lost.)*
- **A stacked PR conflicts the moment its base is squash-merged.** Squashing PR 1 puts its
  content on main as one new commit; PR 2's branch still carries PR 1's original commits, so
  the three-way merge sees the same hunks changed on both sides and reports `CONFLICTING`,
  which also means no CI run. The fix is mechanical and the chair can do it without the
  author: `git rebase --onto origin/main <old-head-of-PR-1>` in a scratch worktree drops the
  merged commits, then prove the tree is the author's — `git diff <author's head> HEAD` must
  show nothing but what main gained meanwhile (a release commit's changelog and version bump)
  — and force-push with `--force-with-lease=<branch>:<author's head>` so a concurrent push is
  refused rather than overwritten. Retarget the PR to main *before* the push: a push that
  lands while the PR is still conflicting against its old base starts no CI run, and the
  retarget itself is an `edited` event, which triggers nothing — close and reopen the PR to
  get the run. Say so on the PR, with both shas. *(2026-09-17: four stacked PRs, each
  `CONFLICTING` after the one before it merged; three rebases, all tree-identical; the one
  pushed before its retarget sat with no run until reopened.)*
- **Read the stack off `merge-base`, never off the PR body, and dry-run the second merge
  before landing the first.** A body that says "built on PR 1, merge after it" describes the
  branch as the author last saw it; `git merge-base --is-ancestor <PR-1 head> <PR-2 head>`
  says what it is now. A PR 2 that has since been put back on main is *not* stacked — it is a
  sibling that edits the same lines — so it merges clean today and conflicts in every shared
  file the moment PR 1 squashes, with no `--onto` to save it. Before merging PR 1, squash it
  onto main in a scratch worktree and merge PR 2 on top: the conflict list is the resolution
  work, priced before anything is irreversible. When it conflicts, merge main into PR 2's
  branch (a plain push, no force, the author's commits untouched), resolve with the registry
  or file order as the tie-break, gate, and say on the PR which files and why. *(2026-09-17:
  a PR body claimed to be stacked on its sibling; `merge-base` showed both on main, sharing 16
  files; a dry run found 35 hunks in 12 files, resolved by script in one merge commit.)*
- **`gh pr checks` exits non-zero for the first seconds of a PR's life** ("no checks
  reported"), before CI has registered a run, and a repo without required-status protection
  lets `gh pr merge` through regardless. A chain that echoes the exit code and merges on the
  next line has therefore merged before CI ran. Wait until the PR's `statusCheckRollup` has
  at least one entry, then watch, and make the merge conditional on the watch's exit code.
  *(2026-09-16: a docs-only harvest merged with its gate still `IN_PROGRESS`; the run on main
  was watched by hand afterwards.)*
- **A gate that got lucky is not a gate.** Re-gate on any new head, always; a gate keyed to a
  stale head is evidence about a tree that no longer exists. Gate artifacts are per-agent and
  per-head (`<issue>-<worktree-id>`), never a shared `/tmp/g*` that a sibling can pick up.
- **A test that cannot fail is a finding.** Before trusting a green, ask what input would have
  to exist for it to go red; if nothing in the corpus can, the guard is vacuous. *(A
  date-keyed fixture graded INSUFFICIENT_DATA whatever the readings said, and passed
  because two labels folded onto one decision — found by a mutation that did not go red.)*
- **A flag PR gets one mutation per site the flag passes through, not one per behaviour it
  changes.** The sites are the action's reducer case, every read that decides behaviour, and
  the read that persists it (the storage fallback for a missing field). A builder's own
  mutations follow the behaviours and leave the case that nothing dispatches by accident.
  *(2026-09-17: four switch PRs in one day; the chair's "the reducer ignores the action"
  mutation stayed green on one of them, "the saved-object write deleted" and "the row opens
  the overlay without shutting the sheet" on another — all three reported red by the builder's
  own list, which had mutated the outcomes and never the levers.)*
- **Metrics inherit the blind spots of their instrumentation.** A 14-day "clean" clock read
  all-zero while a destructive write went through a path it never instrumented. Prefer
  outcome-shaped denominators (every audit row) over signal-shaped ones (the alarms you installed).
- **A review artifact that elides is not the review.** A swap table rendered five candidates
  per neighbourhood and "+45 more"; the approver passed what they saw, and 41 wrong rows and
  10 rows with no honest home sat in the elided part. Render the whole consequence (or the
  delta against the last reviewed state), and probe the layer that fails — the legality
  function on every new row, not the label column — before calling a curation gate satisfied.
  *(2026-09-12: a 301-row import passed QC on a five-per-row table; the second read, made
  with the legality function, found 51 rows wrong and the first QC comment was retracted.)*
- **A compiler's library setting is not a determinism guard.** A TypeScript package with
  `lib: ["ES2022"]` and `types: []` rejects `document`, `setTimeout` and `process`, which made it
  feel sealed; but ES2022 itself ships `Math.random` and `Date`, so a seeded, replayable engine
  could read the clock or unseeded randomness and still typecheck. The chair's brief asserted the
  opposite; a builder's probe file proved it wrong. Guard determinism with a mechanical scan in the
  gate (source with comments stripped, banned names listed, an empty scan refused), and
  mutation-check the scan. *(2026-09-13: caught before any nondeterministic code landed; the scan
  went into the gate the same night.)*
- **A test that derives "today" from a different clock or day function than the code is a
  time bomb with a calendar fuse.** Two helpers keyed the weekday on the UTC date while the
  code resolved a local day floored at 05:00; main went red every evening at UTC
  midnight, with no change to blame. Derive the value from the function the code uses, or
  freeze the clock the code reads; and run the suite once at a boundary hour before
  trusting a day-shaped test.
- **A test with a literal future timestamp is a time bomb.** A fixture hard-coded a proposal's
  `expires_at` a day ahead; the code under test read the WALL clock for expiry while the test
  froze a different clock, so at the minute the literal passed, every gate on main went red
  with no change to blame. Freeze the clock the code actually reads (one injectable clock per
  module), or key the literal off the real clock; never both clocks in one module.
- **Never `gh run watch` in an unattended loop** — ~1200 API calls an hour each; four of them
  exhausted the hourly budget and 403'd every chain and builder. Poll every 90–180 s.
- **Gate the PR merged onto today's main, not the PR alone.** A branch's tests passed and its
  CI was green, and the merge would still have turned main red: a test asserted that a
  serialized state did not contain a substring, and a sibling PR that landed in between added
  a field whose name contained it. Before merging, merge the head onto current main in a
  scratch worktree and run the gate there; a green run on a head that lacks main's latest
  commit proves the branch, not the merge. *(2026-09-19; caught by the preview gate, fixed by
  asserting identity of the object instead of absence of a word.)*
- **Replacing an assignment with a function call can break a guard that relied on the
  assignment being repeatable.** A skip handler "made sure the card was seated" by running
  the same seating code the normal path ran. While seating was `hand = card` that was
  harmless twice; once it became `grant(hand, card)`, which increments, a skip during the last
  half second granted two. The builder's tests passed because none skipped inside that window.
  When a write stops being idempotent, grep every caller that runs it "to be safe" and probe
  each overlap window with a test. *(2026-09-19; the chair's probe read expected 1, got 2.)*
- **The builder's "what has no witness" list is the QC map.** A PR honestly listed five
  pointer-handler behaviours its DOM-less suite could not prove, one of them worded as a fact
  ("a quick tap flips and never charges"). Reading exactly those handlers found two real bugs
  in ten minutes: the claim was true of the intent and false of the code — the press fired on
  pointer-down, and every still release flipped the card, holds included. An unwitnessed
  sentence in a PR body is a hypothesis; read the code under it before anything else.
  Related craft: one press is three gestures (tap, hold, drag), and the tap window belongs in
  the state machine as a phase whose time is taken *out of* the design's total, not added to
  it. *(2026-09-19.)*
- **A state machine tested by hand-cranking its clock says nothing about the thing that cranks
  it.** A reducer owned every phase and a pure `nextTimer(state)` said what was owed; the tests
  called it in a loop and were thorough. The one `useEffect` that actually armed the timeout was
  keyed on a hand-written list of four fields; three features added a branch to `nextTimer` and
  none added its field to that list, so in the browser each sequence played one beat and froze.
  Three PRs passed builder tests, mutations and chair QC; the approver found it on his first
  click. Put the dependency list beside the function whose reads it mirrors, export it, and test
  the property the driver relies on — every beat that leaves a timer owed changes the list.
  And when QC is diff-and-gates with no browser, ask of each new timed sequence: what, outside
  this diff, makes it tick? *(2026-09-20.)*
- **A retrying negative assertion waits a transient bug out.** A browser smoke asserted "no
  error line appears after a tap" with the framework's auto-retrying form
  (`expect(locator).toHaveCount(0)`); the line in question removes itself after 1.8 s, so with
  the fix deleted the assertion simply polled until the evidence was gone and passed. "Must not
  appear" is read once, at a moment inside the thing's lifetime — and every such line gets a
  mutation, because a negative that cannot fail looks exactly like one that did not.
  *(2026-09-20; the chair's mutation survived, then went red after the one-line change.)*
- **Pin the browser-test runner to what the gating machines run.** The newest Playwright
  installed cleanly and then refused to launch: it had dropped the approver's OS two minor
  versions earlier. A gate that the local machine cannot run is not a gate there; pin, and
  write down why next to the pin. And on a self-hosted runner, learn whether the job can
  install system libraries by reading a failed run's log, not by assuming.
  *(2026-09-20.)*
- **Match a red run's error TEXT to the mechanism, not only its failing line.** Two different
  races can fail on the same line and read differently: one times out with the element in the
  wrong state, the other with no such element at all. A hypothesis that fits the line and not
  the text is a wrong brief. And keep what the run saw: upload the test runner's failure output
  as an artefact on failure, with a retention period as its cleanup, or the next red can only be
  read from a log. *(2026-09-20: a browser smoke reddened twice on a CI runner; the chair briefed
  a 900 ms race at 70 %, and the builder showed from the same log that the text — "element(s) not
  found", not "received loaded" — meant a press had missed a moving element inside a 38 ms
  window. CPU throttling reproduced neither; an injected delay between the two calls reproduced
  both, 0/5 before and 5/5 after.)*
- **When a change decouples two values that used to be equal, every existing test is vacuous on
  the difference.** Grep every reader of the old value, classify each as wanting the one or the
  other, and write the witness with the two DIFFERING. A required parameter, not an optional
  one, makes the compiler do the audit. A witness that renders a component directly does not
  cover the screen that wires it: mutate the wiring too. *(2026-09-20: a label read the player's
  last pick where it wanted the round's rules; every test passed because every fixture had the
  two equal. The chair's diff read caught it; reverting the wiring was still green until a
  whole-screen witness was added.)*
- **A mutation harness restores in the caller, not in a `finally` a timeout can skip.** Check
  the mutated files' hashes after every mutation run, killed or not. *(2026-09-20: two mutation
  runs were backgrounded past a tool timeout and killed; the source sat mutated until the
  builder compared hashes by hand.)*
- **A fixed port in the gate makes the gate single-tenant.** Two worktrees gating at once on
  one machine collide, and the second reads as a broken config, not as contention. Take the
  port from the environment, or pick a free one. *(2026-09-20: four gate runs lost to "address
  already in use" while another builder's gate held the preview server's port.)*
- **A mutation must USE the value it breaks, or a bundler's module semantics can hide it.**
  Under a transform that turns imports into property reads on a namespace object (Vite's SSR
  transform, which is what Vitest runs), a circular import read too early is `undefined`, not
  a TDZ throw: a bare `const X = IMPORTED` at module top level passes everything. Make the
  lever call it, index it or format it. And a module with no cycle has no entry-order hazard,
  so an entry-order test for it can never red — assert what it can hold (identity of the
  re-export) and say so in the file. *(2026-09-20: the chair's suggested mutation for an
  import-cycle witness went green 42/42; the builder nearly filed it as a vacuous guard before
  finding the lever had read `undefined` and thrown nothing.)*

## Parallel agents and worktrees

- **One tree per mutating agent.** Two agents in one checkout corrupted each other's HEAD.
  `isolation: worktree` for agents; a `git worktree add` for the chair's own side work; never
  `git checkout` in the main tree while a gate chain has it detached (a false red on a real PR;
  repeated 2026-09-07 with a `checkout main && pull` under a running gate — recovery: kill that
  gate, delete its exit artifact, clear the stale lock, relaunch it). Make the check a habit:
  `ls /tmp/<tree-lock>` before any command that touches the main tree.
- **Worktrees isolate the repo, not the scratchpad.** Builders overwrote each other's PR body,
  gate script and comment draft mid-run; one victim's first green came from the WRONG worktree.
  Scratch under a run-unique path, always. The session-uuid scratchpad the harness hands out is
  NOT that path: every builder a chair dispatches shares the chair's uuid, and two builders
  gating at once wrote the same `gate.sh` and exit file there — a green exit file over another
  run's red log. Use `<scratchpad>/<ticket>-<slug>/`, and say so in the brief. *(Five builders
  in parallel, 2026-09-22.)*
- **A worktree gate can silently test main.** A shared virtualenv's `.pth` points at the main
  checkout's `src/`. Each worktree installs its own environment and asserts the package
  resolves inside the worktree before trusting any green.
- **Never `git stash` in a shared repo.** Stash refs are repo-global; one agent's red-first
  stash-pop captured a sibling's in-progress edits. Copy files aside instead.
- **PR-state is not liveness.** "No pushed branch" means "hasn't pushed yet"; a live builder's
  worktree was deleted in a hygiene sweep on that assumption. Sweep only worktrees whose task
  has reported AND whose PR is merged or closed; skip anything with unexplained uncommitted
  content; harvest the builder's memory notes first (they live inside the worktree).
- **A session branch or process restart drops subagent transcripts.** Three builders parked on
  five-minute pollers ("rebase when PR X merges") silently ceased to exist when the chat was
  branched; their heads never moved and nothing reported it. Never park a builder on a long
  wait — have it finish and report, and re-dispatch a fresh one when the trigger lands; treat
  an agent id as unreachable after any session boundary until it answers.
- **Squash merges break ancestor tests.** `merge-base --is-ancestor` says "unmerged" for
  squash-merged work; test mergedness with the PR state or `git log --grep`.
- **Serialize merges behind releases.** One release runner plus a "upstream changed" refusal
  means a merge stream faster than the drain rate releases nothing (six merges, zero deploys
  in one night). Merge one, wait for the tag AND the health endpoint, then the next. A docs-only or
  harness-only PR counts too: it shows zero checks on the PR, yet its push to main runs the
  release job and trips the refusal on the release already in flight. *(2026-09-13: a memory
  harvest merged six minutes after a code PR; the code PR's release failed on "upstream branch
  has changed" and only the harvest's own release shipped both.)*
- **A release is verified by the newest tag plus the health endpoint**, never by `describe` on
  the merged sha — the release tool tags its own bump commit on top.
- **Two builders on one function.** Two PRs modifying the same function in one day compose
  textually and can still be wrong together; the second to land re-reads the first.
- **An agent definition placed this session is not dispatchable this session.** `bin/init`
  drops `.claude/agents/builder.md` into the repo, but the Agent tool's type list is read at
  session start; `subagent_type: "builder"` answers "not found" until the next session.
  Dispatch with `general-purpose`, `model: opus`, `isolation: worktree`, and the definition's
  body inlined at the top of the brief — same contract, no restart. *(2026-09-07: the first
  dispatch on a freshly bootstrapped repo.)*
- **A builder that waits in one long loop is killed as stalled.** The harness's stream
  watchdog ends a subagent's turn after ~600 s with no output; a single tool call that polls
  with `sleep` for ten minutes looks exactly like a hang, and the builder's own background job
  may die with it (no exit file, no summary line — unmeasured, not failed). Brief builders to
  launch gates and tiers with the tool's background option and let the harness wake them on
  exit, and to keep any poll to its own short call. Recovery is a resume message, not a
  re-dispatch: the worktree and the edits survive the kill. *(2026-09-13: two builders stalled
  twice each on the same minute, waiting on 45-minute integration tiers; both resumed in place.)*
- **A foreign builder in print mode must never wait on a background task.** Two runs of a
  second-vendor CLI (`agy`, Gemini 3.1 Pro and 3.8 Flash) each produced a green fix, then died
  polling their own background gate ("I will wait for it to complete" ×5) until the vendor's
  WEEKLY individual quota ran out — neither reached a PR, and the quota was gone for seven
  days. Put the gate in the foreground inside the brief, read the vendor's quota line before
  dispatch, and keep the chair's finish-by-hand path (read the diff, mutation-check, commit with
  both bylines, open the PR) as the planned fallback, not an emergency. *(2026-09-09: the
  fix shipped that way after 51 minutes of Gemini wall time.)*

- **Never sweep branches with `--merged | xargs git branch -d`.** A running builder's worktree
  starts on a placeholder branch at the dispatch sha, which `--merged` lists the moment main moves;
  the sweep deleted one while its builder worked (2026-09-15; harmless only because the worktree
  had already switched to its feature branch). List first, read `git worktree list`, delete by
  name.

- **The worktree guard's git check matches on the path, not the command.** A worktree under a
  directory whose name contains `git` (`~/Github/…`) makes any Bash line that builds a path from a
  shell variable or chains `cd … && …` fail with "names git in a form too complex to verify",
  whether or not git is involved (2026-09-15, three refusals in one build). Use literal absolute
  paths, read several files with one `head -200 a b c`, and keep the gate in a scratch script
  invoked with literal arguments.

## Environments and tooling

- **The shell is zsh.** Arrays are 1-indexed; a bash-idiom loop silently shifted every issue
  title by one. `set -e` does not stop a failure inside `$(…)`. Check every captured variable.
  An unbraced variable before a colon takes a modifier: `"$ROOT:refs/heads/main"` expanded as
  `$ROOT:r` then `efs/heads/main`, and a force-push failed on a refspec that matched nothing
  (2026-09-10); `:h`, `:t` or `:u` would have rewritten the value with no error. Brace it:
  `"${ROOT}:refs/heads/main"`.
- **`localhost` is a secure context; the deploy target may not be.** Browser APIs gated on a
  secure context (`crypto.randomUUID`, `crypto.subtle`, clipboard, service workers) work on
  `localhost` over plain HTTP and are `undefined` on a LAN host over plain HTTP. A static site
  passed dev, preview and two browser checks, then rendered a blank page on its first deploy
  (2026-09-14; `crypto.randomUUID is not a function`). The check that sees it is the deployed
  URL itself, loaded in a real browser after every first deploy, with the console read. Prefer
  `crypto.getRandomValues` for seeds and ids; it has no such limit.
- **Environment cleanup is a ledger item.** Per-worktree virtualenvs reached 17 GB and 76
  environments before anyone looked; two image tags per release filled a deploy host to 263 GB of
  Docker images. Measure (`du`, `docker system df`), prune by an explicit filter (a label, a
  dead path), never by "the first match" — one sweep that guessed the wrong `.pth` deleted six
  live environments including two running builders'.
- **Long operations over SSH run detached.** An `expect` session's timeout killed a prune
  mid-way (the daemon kept going, blind). `nohup … &` on the far side, poll a log that ends with
  `DONE`. In Tcl, square brackets inside the spawn string are command substitution.
- **A captured buffer can silently keep only the tail.** `expect_out(buffer)` holds the last
  ~2000 bytes (`match_max`); two remote rounds came back as their last six lines before anyone
  noticed (2026-09-07). Capture the whole session to a file (`log_file -a`) and read that.
- **Mask a secret by its exact value, never by filtering lines.** `grep -v password` let a
  fragment through once; substitute the value itself (`string map`, `sed "s/$SECRET/***/g"`)
  before anything is printed or read.
- **A laptop sleeps between heartbeats** unless something holds it awake; an unattended run on
  a sleeping machine stalls without an error. Check the power log before blaming the pipeline.
- **Prefer the CLI over an MCP for the same service** when the repo's conventions are written
  against the CLI (`gh`, `psql`); ask rather than guess a host or credential.
- **`git -C <dir> rev-parse --git-path <file>` answers relative to YOUR cwd, not to `<dir>`.**
  Test that path from another directory and it is a missing file. Use `--absolute-git-dir` and
  append the name. *(`bin/wake`, 2026-09-07: the "fetching now" note fired on every session
  from every repo except the playbook itself.)*
- **BSD awk rejects a `-v` value that contains a newline** ("newline in string"); GNU awk
  accepts it, so a script tested on Linux breaks on macOS. Pass one `-v` per line and `print`
  them in order. *(`bin/install`, 2026-09-07: the marked block in CLAUDE.md was deleted and
  re-appended on every run instead of replaced in place.)*
- **A branch outlives its squash merge.** A docs branch kept the nine commits its PR had squashed
  into one, so the next PR from it conflicted on every file the first touched, and the classifier
  blocks the force-push that would fix it. After a squash merge, branch fresh from `main` for the
  next change; never keep a long-lived docs branch. Recovery without a force-push: cherry-pick the
  new commits onto a fresh branch, open the replacement PR, close the old one with a pointer.
  *(This playbook, 2026-09-10.)*
- **Read the PR state before every push to its branch.** A pushed commit on a merged PR's branch
  is silent: no error, no CI, and the PR page still shows it. The approver merged a decision PR
  46 minutes before the chair pushed an amendment to its branch; the amendment never reached
  `main`, a comment on the merged PR announced it as included, and a second PR stacked on that
  branch inherited the stale base. Run `gh pr view <n> --json state` right before the push; if it
  merged, branch fresh from `main`, cherry-pick, open a new PR, and retract the claim where it was
  made. *(2026-09-13: caught only because the next dispatch brief re-read `origin/main`.)*
- **Purge branches by PR record, not by ancestry.** A repo that squash-merges leaves every PR
  branch's commits OUTSIDE main's ancestry, so `git branch --merged` and
  `merge-base --is-ancestor` call a merged branch "unique work"; and if the remote copies are
  deleted first, the "local equals its remote" test stops seeing them too. Classify by the PR
  record first (`gh pr list --state merged/closed --json headRefName`, paginated), then by
  `git cherry <main> <branch>` for the residue (zero `+` lines means main already holds every
  patch), and only then by ancestry. Run the local pass BEFORE the remote one, or keep the
  PR-head list from before the remote deletion. Bulk deletion is the approver's hand: the
  harness classifier refuses mass `push --delete` / `branch -D` from the chair, and a script
  wrapper would be a workaround — write the script, explain each class in its header, and hand
  over the command. *(2026-09-09: a first local pass kept 427 branches as "unpushed"; 425 were
  merged-PR heads and the other two had zero unique patches by `git cherry`.)*
- **`git branch -r` counts EVERY `refs/remotes/*` namespace**, including leftovers of an old
  pull-request refspec (`refs/remotes/pr/*`) that no `fetch --prune` will ever touch because no
  such remote exists. Read `git ls-remote --heads origin` before calling anything a remote
  branch, and delete stale local refs with `git update-ref --stdin` (one ref per invocation
  otherwise). *(2026-09-09: of "1,576 remote branches", 8 were on GitHub and 1,030 were those
  leftovers.)*
- **A browser check needs a tab the browser is painting.** A locked or sleeping display, or
  an automation window behind another, leaves the tab `document.hidden`: no animation frames,
  no `ResizeObserver` callbacks, no layout-driven effects — so a component that waits for a
  measurement renders its fallback and the check reads as a bug in the app. Before judging a
  rendering result, read `document.visibilityState` and whether one `requestAnimationFrame`
  fires; if the tab is hidden, the evidence is the builder's visible-tab pass or the deployed
  URL on a real device, and the QC comment says which. *(2026-09-16: a camera that turns on
  after the board is measured looked unbuilt in a hidden tab at 03:00; the display was off.)*
- **The browser automation tab group is shared by every session on the machine.** The tab
  `tabs_context_mcp` hands back may be a builder's, and navigating it mid-check wipes that
  builder's page state and globals without either side seeing why. The chair creates its own
  tab (`tabs_create_mcp`) and treats any tab already in the group as someone else's; a builder
  does the same. *(2026-09-16: the chair navigated the one tab in the group to its own port
  while a builder was reading a button's rect through it; the builder's `window` helpers
  vanished and it lost a pass.)*

## Writing and briefing

- **A count in a brief is computed with the code's own filter.** `47 files − 6 print masters
  = 41` forgot the three `.md` and the `.DS_Store` the suffix rule skips; the builder counted
  with `find` plus the rule and got 37. Never subtract from `ls | wc -l`; run the filter.
  *(2026-09-07: a new repo's first PR, under "Where the brief was wrong".)*
- **Brief from the repo at dispatch time, not from a summary.** Eight wrong briefs in one day
  shared that cause; the builder who argued with the brief was right every time. Every brief
  lists what to verify first and asks for a "Where the brief was wrong" section.
- **Say done after done.** Two claims made before the action; both retracted the same day.
- **Timestamps come from the clock.** Three ledger lines were stamped thirty minutes ahead of
  reality and had to be corrected.
- **Mirror the producer's formula in a sibling surface** — grep the producing function and
  quote it — never choose a formula that sounds right. *(A dashboard shipped one estimation
  formula where the system computes another; two numbers for one metric.)*
- **Measure before optimizing.** Instrument, read, decide; park low-value work; a rejected
  architecture is not re-proposed casually. Confidence on recommendations, with the `%` sign.
- **Builder cost is calls × context, not bulk reads.** Five builds measured from their
  transcripts (2026-09-14): 91 % of each build's price was cache re-reads, because every one
  of 1,000–1,800 tool calls re-sends the whole conversation, which reaches 600–840k tokens.
  Only 6 of 1,306 tool results exceeded 350 lines — the builders already trim output — so a
  "route big reads to a cheap model" hook would have fired on half a percent of calls. The
  same work capped at 400 calls with a fresh context per phase projects 57–67 % cheaper
  (the projection model reproduced each actual bill to the dollar); a 362-call build cost a
  sixth of a 1,300-call one at the same QC bar. Measure the transcript before buying the
  fashionable fix; the fashionable fix was aimed at the wrong tail.
- **A model's account of its own context is not a witness.** Asked to quote every hook line in
  its context, a Haiku session quoted one of two; the hook had emitted both. Witness context
  injection with a `tee` to a file from inside the hook, then read the file. Note that Claude
  Code prefixes the first stdout line with `SessionStart:<matcher> hook success:`, so test
  "contains", not "begins with". *(First new-session test of `bin/wake`, 2026-09-07.)*
