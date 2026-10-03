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
  was watched by hand afterwards.)* Printing the checks line in the same command as the merge
  is the same mistake: the merge runs before anyone reads the line. The only safe form is
  `gh pr checks N --watch --fail-fast && gh pr merge …`. *(2026-10-03: a chair printed
  `gate IN_PROGRESS` and merged in one command, writing "CI green" in the QC comment; the run
  finished green, and the comment was corrected on the PR.)*
- **A gate that got lucky is not a gate.** Re-gate on any new head, always; a gate keyed to a
  stale head is evidence about a tree that no longer exists. Gate artifacts are per-agent and
  per-head (`<issue>-<worktree-id>`), never a shared `/tmp/g*` that a sibling can pick up.
- **When a known-red `it.fails` is fixed, hunt the `try/catch` blocks in nearby tests that tolerate the
  same bug.** A ten-minute winter run had wrapped the weather step in a `try/catch` whose comment said
  it absorbed the very `RangeError` the fix removed; left in place it would have passed on a
  regression. The fixing PR removed it and the run became a second witness. *(2026-10-01.)*
- **A test that cannot fail is a finding.** Before trusting a green, ask what input would have
  to exist for it to go red; if nothing in the corpus can, the guard is vacuous. *(A
  date-keyed fixture graded INSUFFICIENT_DATA whatever the readings said, and passed
  because two labels folded onto one decision — found by a mutation that did not go red.)*
- **A mutation that changes nothing the system can observe cannot red, and that is a fact about
  the mutation, not the test.** Two in one day (2026-10-01): dropping `PRAGMA synchronous=FULL`
  stayed green because both SQLite drivers already default to FULL in WAL mode; moving the
  `PRAGMA user_version` write earlier inside a transaction stayed green because the pragma is
  rolled back with the transaction. Before calling a guard vacuous, check whether the mutated line
  was ever load-bearing (read the default, read the transaction semantics); then mutate something
  the behaviour depends on (set the version outside the transaction → red). Record both in the PR:
  the mutation that could not red and why, and the one that did.
- **A witness that compares only the end state cannot see a rate error; compare along the run.** A
  render-independence witness stepped two worlds, one drawn and one not, and compared their hashes
  at the end; a timer that the draw also decremented ran down twice as fast in the drawn world and
  ended at the same clamped value, so the mutation stayed green. Hashing at checkpoints along the
  run (every N steps, and in the frames where the thing being tested is alive) made it red. The
  rule generalises: anything that converges, saturates or clamps hides its rate at the end; the
  evidence is the trajectory. Mutation-check a witness with a rate bug, not only a value bug.
  *(2026-10-01, moving state writes out of draw: eight writers, the timer found the gap.)*
- **A two-sided witness is blind to a fault both sides share; check each value against its
  inputs too, and mutation-check every call site on its own.** A witness that compared a world
  stepped with rendering against one stepped without stayed green when one of three call sites of a
  moved builder was dropped: both sides lost the same rebuild, so they still agreed. Adding an
  assertion that the built field matches its inputs (null when the feature is off, the right size
  otherwise) made that mutation red. And when a writer moves, measure its order on the random
  stream against the commit before the **first** move of the pair, not the immediate parent: the
  parent already carries the swap you are undoing, and the two agree for the wrong reason. Pin one
  value from the stream in the committed test. *(2026-10-01, the last draw-time writers: three
  call sites, one blind spot; the order measured against the pre-#50 commit, and the edge that had
  been judged unreachable was reached by two purchases before one step.)*
- **Each control watches one seed; when a fix can change the opening state, pin many seeds, and
  write a stop condition as the mechanism it guards, not as an invariant.** A one-line fix moved
  the opening layout for 166 of 300 seeds, and the four seeds the replay and screenshot controls
  pinned were all among the unaffected ones, so every control stayed green by luck. The chair had
  also written "the generation stream's order must not change" as a stop condition when the
  mechanism to guard was "the first pond must look as the prototype's"; the builder could show the
  invariant was unsatisfiable by any ordering and proceeded, which was right, but a condition
  that named the mechanism would have sent it to the approver before the work. The faithful
  version then got a 60-seed pinned witness recorded against the parent's source taken
  byte-for-byte with `git show`; the alternative order reds 38 of them. Before predicting that
  controls move, probe the controls' own seeds. *(2026-10-01, the floor field and the first pond's
  algae; the approver ruled prototype-faithful.)*
- **Removing a canvas read-back can change pixels of draws it never touched; compare with GPU
  acceleration on and off before calling a change pixel-identical.** A Chromium `getImageData`
  moves the canvas it reads to CPU raster; a refactor that replaced the read-back with a pure
  model left the same draw calls on a canvas that now stayed on the GPU, and the anti-aliasing
  differed by up to 16 alpha levels on a quarter of the pixels while every draw call, every random
  draw and every input was proven equal. With 2D acceleration off all variants were 0 px apart,
  which located the cause. The ruling was to accept (the read-back was the accident), but the
  measurement is what made it a ruling and not a guess. Related: `git checkout -- <file>` to undo
  a mutation also discards uncommitted work in that file; commit a WIP before mutation checks.
  *(2026-10-01, algae coverage off the canvas.)*
- **Look up which class owns an event in the vendor's typings before wiring it; a typed emitter
  still accepts any string.** A ticket said to handle Windows' logout on the app object; in the
  framework's typings every mention of that event is on the window classes and none on the app,
  but the app's `on()` takes any event name, so the wrong wiring type-checked, would have passed a
  unit test with a fake emitter, and would never have fired. The builder grepped the typings, wired
  it on the window, and proved it on the built app by firing the event and killing the process.
  The same reading found that the event cannot be held: the OS may end the process once handlers
  return, so the save races it and only a real sign-out shows whether it lands. *(2026-10-03, the
  logout save.)*
- **When a poll leaves the engine, put its replacement on the method every driver calls, not in
  the app's loop; and "equal by construction" must cover every point the callers test.** A canvas
  size poll became a command dispatched from the app's frame loop; every harness that steps the
  engine directly (the screenshot baselines, the replay, the lab batch) then stepped a 300×150
  canvas with zero steps of sizing, and the baselines caught it. The sync moved to the façade's
  own `step`. In the same slice, keep-out rectangles "equal to the old predicate" were clipped to
  the canvas while the placement code tests points off it; the rectangles had to run a full
  canvas past each edge before equality held on a grid that runs past every edge. *(2026-10-01,
  DOM inputs out of the sim.)*
- **Do one real `node` import of the graph before promising "no build step"; and read the spec's
  line and the engine's clock before a brief states how time passes.** Node 24's type stripping
  refuses `<T>expr` assertions and extensionless imports; a module hook that calls the repo's own
  `typescript.transpileModule` runs the source unchanged. The same brief said the pond keeps
  stepping between sessions; the spec and the engine's clock both say a game day is minutes of
  stepping while present, and stepping between sessions would have made a real day 180 game days.
  The builder read the spec and followed the code, which was right. *(2026-10-01, the lab batch.)*
- **Before pinning a seeded control, check per configuration that removing the input reds it; and
  a `>`→`>=` mutation on a predicate over continuous values cannot red a run-shaped test.** A
  control meant to pin HUD keep-out rectangles was first written at the seed every other control
  uses; at one of its two sizes the run never came near a rectangle, so dropping the input stayed
  green there. A scan of 40 seeds found one where the input mattered at both sizes (22 of 40 at one
  size, 39 of 40 at the other; a 1 px shift mattered in 6 of 80). Strictness of the predicate is a
  grid test's job, one that lands on the edges exactly; the control's header says which test
  covers it. *(2026-10-01, the keep-out control.)*
- **When a refactor removes reads that a positional replay queue serves, map old recordings with a
  getter that consumes one read per access, and bump the recording version.** Input handlers read
  the injected clock one to three times per event, and the recordings replay those reads by
  position with the read count as part of the pinned hash. Moving the timing onto an event stamp
  carried by the command removed the reads; a replay that simply dropped them would have shifted
  every later read in the step. A `t` getter that consumes one recorded read per access reproduced
  the old values in the old order, the old controls held unchanged, and new recordings got a new
  version so nothing replays misaligned. The chair's brief had claimed "the drain-time read and
  `t` agree in the controls"; the raw recording showed reads within one event differing by 0.1 ms.
  Check a claim about the controls against the raw recording before building on it.
  *(2026-10-01, commands carry their event time.)*
- **A new control that hashes a stepped World uses the rounding, the margin, per-key hashes and
  soft assertions from its first commit.** The cross-CPU lesson above was in the playbook and the
  support kit had `roundTo` and `roundMargin`; a new control still hashed the raw World, passed on
  the developer's arm64 Mac and failed on the x64 runner, and the first failing assertion hid which
  key moved. One diagnostic push with per-key lines named three keys (all within 1e-6), and the
  portable pin followed. The round trip is avoidable: start from the kit's helpers, print per key,
  assert softly. And when reading a failure, the first failing assertion is not the first
  assertion: the ones above it passed. *(2026-10-01, the keep-out control, one CI round trip.)*
- **Before rounding a cross-CPU comparison, check whether whole-number columns differ; past a
  horizon the two machines are different ponds, and no rounding helps.** A 180-frame control had
  stayed within 1e-6 across arm64 and x64, so the chair diagnosed a later red the same way; the
  builder read the failing rows and found integer counts differing on the first day of a
  three-game-day run (about 86,000 frames): last-bit float differences had grown into a different
  world. The fix was to confine the long comparison to the CPU the sample was made on and keep the
  short, portable checks on every CPU, and to say in the data's README which CPU's ponds the
  committed samples are. The horizon decides: short runs round, long runs diverge. *(2026-10-01,
  the light-feeder sample; the chair retracted on the PR.)*
- **Before promising "this hash will not move", grep the state for bookkeeping fields.** A brief
  said the whole-World hash and the platform sidecars would hold unless a listed row moved a field;
  the engine's change detection kept the JSON of the last snapshot on the World itself, so
  replacing the detection (the slice's purpose) moved every World hash, four controls and sixteen
  sidecars, by that one key. The map-back was clean, but the brief had promised the opposite. A
  change-detection, a cache, a signature, a "last sent" value: anything the engine keeps for its
  own bookkeeping on the state object is inside every hash's reach. List those fields first.
  *(2026-10-01, the engine contract.)*
- **Count the object references by probing the live graph, not by reading the engine map; and a
  bake that draws from the random streams must bake on copies when restoring.** A brief listed
  five reference sites from the documentation; a probe of a running World found eighteen, and most
  of the objects they pointed to carried no id, so an id scheme could not have worked and a path
  scheme (`{ $ref: <first place> }`) did. The same slice found that the background bake draws from
  both random streams; restoring a save by baking on the real streams broke continuation at once,
  and only baking on copies kept the hydrated pond stepping as the live one. Before writing a
  serializer's brief, run a one-off walk of the object graph and list every place a value is
  reached twice. *(2026-10-01, serialize and hydrate.)*
- **Mocking a barrel `index.ts` does not reach a sibling module that imports the file directly;
  a trace-based test must also assert it saw the calls it compares.** A mutation that should have
  made a postcard's put-back bake fail stayed green: the test mocked the render package's index
  to trace bake calls, but the postcard module imported `./bg` directly, so its bakes were never
  traced and "zero differences" was "zero observations". Mocking the module itself and asserting
  the expected number of traced calls made the mutation red. Any test that compares traces, draw
  calls or events must first assert the count it expected to see. *(2026-10-01, the bake's own
  seeded streams.)*
- **Witness the built artefact for anything the build transforms.** A pin on source CSS, source
  config or source markup proves what the author wrote, not what ships: a minifier, a bundler or
  a template step can rewrite it, and the dev server that every builder and reviewer runs skips
  that step. Put the built output under the test (run the same minifier the build uses over the
  sheet, then read the computed style), or the pin stays green on a bug only production draws.
  *(2026-09-28: `transform: none; translate: -50% 0` read right in the dev server and in every
  stylesheet pin; the build's CSS minifier folded it into `transform: translate(-50%)` and dropped
  the `translate`, so a full-screen crossfade drew over half the window on the deployed build. The
  approver found it playing; three hypotheses from the code were all wrong; the builder
  reproduced in a real browser over the built preview before guessing.)*
- **A flag PR gets one mutation per site the flag passes through, not one per behaviour it
  changes.** The sites are the action's reducer case, every read that decides behaviour, and
  the read that persists it (the storage fallback for a missing field). A builder's own
  mutations follow the behaviours and leave the case that nothing dispatches by accident.
  *(2026-09-17: four switch PRs in one day; the chair's "the reducer ignores the action"
  mutation stayed green on one of them, "the saved-object write deleted" and "the row opens
  the overlay without shutting the sheet" on another — all three reported red by the builder's
  own list, which had mutated the outcomes and never the levers.)*
- **Commit the fix before you mutate it.** A mutation is restored with a checkout, and a checkout of
  a file restores the whole file: every uncommitted edit in it goes with the mutation, and the
  builder re-applies its own fix from memory and gates a tree it has to reconstruct. Commit the
  fix (a WIP commit is fine, squash later), mutate, `git checkout -- <file>` or `git stash` never —
  `git diff` against the commit must be exactly the mutation and nothing else. *(2026-09-28: two
  builders in one afternoon, on two different files, each lost its uncommitted fix to the restore
  of its first mutation and rebuilt it by hand; both said so in the PR body, both gates were then
  run on the rebuilt tree.)*
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
- **A release PR is a code PR: preview-gate it like one.** A release tool's PR edits the manifest,
  the package version and a generated changelog, and it opens with the workflow token, so it carries
  no CI run of its own. The chair read the changelog and merged; the trunk went red at the gate's
  formatter stage on the generated file, and the next builder's rebase went red with it. Merge a
  release PR only after the gate on its preview merge, and put every generated file in the
  formatter's ignore list the day the generator is installed. *(2026-10-01, the first release.)*
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
- **A screenshot baseline that is missing must fail, never be written as a side effect; and a
  workflow can only be dispatched once it is on the default branch.** A suite that silently writes a
  baseline on first run turns every fresh machine into a re-pin; make the write an explicit
  `--update-snapshots` and fail the compare when the file is absent. To bootstrap a set on the CI
  platform before the workflow exists on `main`, give it a path-filtered `pull_request` trigger on
  the baselines folder, let the first run upload the PNGs as an artifact and fail on purpose, commit
  them in the same PR, and let the next run compare. Name the set by platform and runtime version,
  and bill the platform that matters (a 2× Windows job runs daily and on demand, not per push).
  *(2026-10-01, the first pixel baselines of a migration.)*
- **A pixel baseline is a guard only once the unchanged tree has passed it twice in a row.** Two
  slices reported "0 diff pixels" on a local set; the third ran the control on the unchanged tree
  three times and got 13 frames red, then 1, then 0 — the set was not stable, and the two earlier
  zeros proved nothing. Before trusting a 0-pixel run, bootstrap and compare the untouched tree at
  least twice; if those differ, the finding is the nondeterminism, and the slice's result is
  "cannot be witnessed by pixels yet". A "use the design token" change on a value that another
  test quotes verbatim from the reference is two contracts in conflict: try it against that test
  first and raise the choice, do not pick one silently. *(2026-10-01.)*
- **A gate that drives a real on-screen window has an input channel open to the operator.** The
  Playwright-driven Electron window opened on screen, held keyboard focus and sat under the real
  cursor; a trusted `pointermove` that landed after the engine mounted set the pointer state and the
  simulation diverged from there, compounding frame by frame. The unstable set above was this: the
  runs went red when someone was at the machine and green when nobody was. Swallow trusted input
  at the window capture phase before the first page script, count and print what was swallowed,
  refuse a run whose world saw input before the swallow was installed, and pin a state hash next
  to each pixel frame: the renderer was deterministic, so a 0-pixel frame can sit on a diverged
  world and never show it. *(2026-10-01, found by splitting the world hash from the PNG hash at
  every capture point across eleven launches, three under CPU stress.)*
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
- **The typechecker cannot see two same-typed functions swapped; a behavioural control must.**
  When a refactor rewires dependency objects (envs, ports, injected helpers), every slot whose
  type admits two candidates is a wiring the compiler signs off either way. Keep a behavioural
  control (a replay hash, a pinned end state) in the gate of every such change. Mutate one slot
  to its same-typed sibling: the control must go red and typecheck will stay green. *(2026-10-03:
  a move of eleven env objects out of a legacy mount; a mutation wiring `pondN` where `pondG`
  belonged passed typecheck and was caught only by eight replay and control tests.)*

- **Before filtering documentation out of CI, grep the gate for what it reads under the docs tree.**
  A repo's "docs" folder is where the humans put prose, and also where someone once put a JSON
  registry the app imports and a test folds over. A `paths` filter of `!docs/**` alone would have
  skipped the gate on the one docs change that can break the build. The shape that survived: list
  everything in, take the docs tree, `**.md` and the agent config out, then name the read-by-the-gate
  subfolder LAST as a positive pattern (GitHub's `paths` is order-sensitive: a later positive
  pattern re-includes). Two consequences to write down where the trigger lives: a filtered push to
  the default branch fires no `workflow_run`, so anything chained on CI (a release) does not run for
  it, and a merge coordinator that waits on "all checks green" must treat "no checks at all" on
  such a PR as nothing to wait for. Earned when a four-core self-hosted box had every lane full and
  a docs PR cost as much as a code PR, twice (2026-09-24).
- **A rename audit that counts readers with `grep` cannot see a hash pin over rendered markup.** A
  test that pins `sha256(render(component))` carries every inline string the component writes —
  an animation name, an easing curve, a duration — without spelling any of them, so `git grep
  <oldName>` reports zero test readers and the gate goes red on the pin. Before a rename that
  reaches an inline style, list the byte-pinned tests over the components that write it and
  budget the re-pins (each with the old→new mapping in its comment and the statement that nothing
  else in the markup moved). Earned twice in one afternoon: a keyframe dedupe and an easing-token
  rename each turned two hash pins red that the grep had called clean (2026-09-24). The same
  blindness in another shape: a test that `readFileSync`s a reference file and pins a line of its
  text. `grep <path>` finds it and a path rewrite lands cleanly — onto a *different file*, and the
  pin goes red on the file's own words. Before rewriting a path, separate the readers that cite the
  file from the readers that read it, and re-quote the pins from the file the path now names
  (2026-09-24, evening: fifteen tests read three design exports from disk; one pin broke).

- **A design export's frame is the artboard, not a spec.** A handoff that says "everything is
  designed on a W × H frame; scale it to the window" is describing the designer's canvas. Writing
  that frame into a decision record as the product's resolution is reading the tool's constraint as
  the approver's intent. What the motion actually needs is one unit both ends of a movement share,
  and an app that already measures its drawn tile has it; the frame's pixels read as tiles. Before
  proposing a layout law from a design file, ask what the drawings *require* and check whether the
  code already supplies it. The approver's words on the draft: "locking down … a fixed resolution
  because that's what design came up with … I cannot rule on this randomly" (2026-09-24).

- **`document.fonts.check()` is a vacuous font witness, and an on-demand dependency has to be
  forced before it can be called working.** Per spec `check()` returns true when *no* face in the
  family needs loading, so it reads true on a page with the font missing. Read the entries of
  `document.fonts` and assert each face's `status === 'loaded'`. In the same build a vendored
  compiler was only ever loaded lazily, so the page's offline load proved nothing about it until a
  probe requested the file by hand (with its SRI) and read its version. *(2026-09-30, an offline
  vendoring slice; both witnesses were strengthened before the PR.)*

- **A formatter-only commit is proven by its fixed point and an AST comparison, not by "one pass
  reproduces it".** Prettier 3.9 needed two passes over a 290 KB dense file (a member chain moved on
  the second), so "run Prettier on the previous commit and `cmp`" would have called a correct commit
  wrong. Prove it twice: run the formatter on the result until it is a no-op, and compare the parse
  trees of before and after (espree or the TypeScript parser) for equality. *(2026-10-01, the
  first move-then-format slice of a migration.)*
- **"Did not throw" is vacuous for code that catches its own errors, and a canvas under jsdom has no
  size.** A game loop that wraps every frame in try/catch and pushes errors to a ring never throws
  from `mount`; and jsdom reports `clientWidth` 0, so the loop skipped every frame and the test
  passed having drawn nothing. Assert the error ring is empty, give the canvas a size through the
  stub, and assert something was drawn (a counted `fill`) and the state export fired. *(2026-10-01.)*

- **A "no behaviour change" control run sees only what it exercises and what its snapshot carries.**
  Three ways one went vacuous in a single refactor (2026-10-01, a loop split with an injected clock):
  a control driven at a fixed 1/60 s never engages the dt clamp, so a clamp mutation stays green —
  add hitches (a 120 ms and a 45 ms frame) so the clamp has work; a control that fakes the global
  clock to the injected clock's value cannot see a site the injection missed, because both read
  the same number — pin time differently on the two sides (fake timers before, the injected clock
  after, the real clock left live); and a hash of a coarse state export cannot see render-only or
  position-level sites at all — say which sites the control covers and witness the rest by name.
  Also: a `setTimeout` replaced by a deadline checked in the step loop changes behaviour between
  the deadline and the next frame; check the deadline on every input handler too, and test both
  windows. The builder found all four; the brief had asserted the opposite.

- **Vitest empties CSS imports, and jsdom has no layout.** A test that reads a stylesheet through
  `import x from './a.css?raw'` gets `''` unless `test.css.include` matches the file, and a
  "the pill does not shift when the number grows" assertion under jsdom measures nothing because
  nothing is laid out. Pin the rule the layout depends on (`min-width`, `tabular-nums`) in the
  unit test and witness the pixels in a real browser; say which is which in the PR.
  *(2026-10-01, a HUD port.)*
- **A background watcher started inside a scratch worktree dies when the worktree is removed.** Its
  cwd is gone, `git`/`gh` fail with "Unable to read current working directory", and the wait
  reports nothing. Start waits from the main checkout, or remove the worktree after the wait
  returns. *(2026-10-01.)*

- **When measuring a rounding margin, count typed-array contents apart from doubles.** A Float32Array
  value is already quantised, so its distance from a 1e-6 edge says nothing about drift risk; a
  margin computed over all 78,000 numbers of a world looked wide, while the 12,900 doubles alone
  gave a 7× margin. Report the doubles' nearest-edge distance, and have the failing assertion print
  one hash per top-level key so the diverging part is named. *(2026-10-01, the second replay control.)*
- **A control hash recorded on one CPU can fail on another from floating-point noise alone; commit
  the portable part and measure the margin.** A 60 s replay control hashed the exported state, the
  entity positions and the full canvas trace; it held run-to-run on the developer's arm64 Mac and
  failed on the x64 CI runner. The exported (rounded) state and the clock-read shape were identical
  on both; positions drifted by 1e-16 to 3e-12 relative in one integrator (`Math.pow` with a
  non-integer exponent, `Math.sin`, `Math.hypot`), zero numbers through 1,000 steps, eleven by
  3,600; the draw trace carried the raw numbers and diverged first. Commit a hash of the rounded
  state plus positions rounded to a stated precision, measure how close the nearest value sits to a
  rounding edge (30× margin here) and write it in the PR, and keep the exact parts as run-to-run
  assertions on one machine. Pin pixel baselines per platform. Diagnose by splitting the hash into
  parts and printing the first diverging checkpoint's values into the CI log; do not reach for a
  per-platform pin first. *(2026-10-01; two builders, one handoff; the second measured it in 60 calls.)*
- **Before deleting "dead" code, grep it for clock and rng reads, then run the controls with it
  removed.** A render path that paints nothing can still be load-bearing: a draw function whose
  every canvas branch was unreachable still read the injected clock once per frame, and the replay
  controls pin the clock reads per step, so emptying that layer moved the 60 s portable hash and the
  whole-World hash while every test stayed green. Dead by reachability is not dead by observation.
  The builder measured it before deleting and kept the function with a header saying why; the
  seam owner removes the read, then the function goes. Same for state fields: a key the deleted code
  wrote stays while any control hashes the whole object. *(2026-10-01, the dead-code drop after a
  domain split: 21 deletions, one kept for its clock read, 16 World fields kept for the hash.)*

- **A release job can fail after it has released; the deploy must read what landed, not the step's
  exit.** semantic-release pushed the tag and the version commit, then its GitHub plugin's
  create-release request succeeded on GitHub's side, the client never saw the answer, the retry was
  refused with `already_exists`, and the job went red — so every deploy job that `needs` it was
  skipped with a real tag and no deployment behind it. Gate a deploy on the tag's existence (or on
  the release object), and keep a dispatch lever that takes an existing tag; the lever is what
  recovered it, by the approver's hand. *(2026-10-01, the fourth release of a night.)*


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
- **A fresh worktree resolves packages to the main checkout's `node_modules` until it installs its
  own.** Node walks up the directory tree, and a worktree under `<repo>/.claude/worktrees/` finds the
  parent checkout's modules first — so a builder's tests and typecheck ran against the main tree's
  dependency versions, not the lockfile it was about to change. `pnpm install --frozen-lockfile` in
  the worktree before any gate, and the builder definition says so. *(2026-10-01, caught by the
  builder; the same mechanism as the shared-virtualenv `.pth` entry above.)*
- **`git reset --soft origin/main` to squash stages a revert of everything main gained since you
  branched.** A builder squashing its slice after a sibling PR had merged saw the sibling's whole
  change staged as deletions; `git status` caught it before the commit. Squash onto the merge base
  (`git merge-base origin/main HEAD`, read first and passed literally), then rebase onto `origin/main`.
  *(2026-10-01.)*
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
  invoked with literal arguments. **The refused set is wider than paths:** on such a machine the
  guard also refused every line containing `$?`, process substitution, `python3 <script>`, `diff`,
  and `sed -f`, even with literal absolute paths — plain `cmp`, `shasum`, `cut`, `sort` and
  `sed -e` pass (2026-09-30, two builders on a fresh repo). Brief builders to prove things with
  inline shell, and to read exit codes from a file the gate writes, never from `$?`.

- **Agent memory that is appended is a cost that compounds and a value that is never measured.**
  A builder agent given `memory: project` and a "record what you learned" paragraph grew, over
  86 dispatches, a 148 KB agent file (1,614 lines, 128 incident bullets) loaded into every
  dispatch — about 37k tokens each — plus 94 memory files (428 KB) and 46 harvest PRs, each a CI
  run and a rebase when two collided on the index. No build was ever shown to have failed for lack
  of it; the same facts were in the PR bodies and QC comments. Two layers are enough: general
  lessons here, the same day, with the incident; repo mechanics in a short agent file that is
  edited, never appended. Time-bound items stay on their ticket. *(Retired 2026-09-24 on the
  approver's ruling; the pile was triaged once by a reader-tier pass and deleted with the
  classification in the PR body.)*

- **Parallel gates share one machine's CPU; cap the builders, not the ports.** Once the smoke's
  fixed port was made free-per-run, nothing stopped six builders gating at once on a 2017 laptop:
  the load average read 70–120 and three gates went red on 5 s timing tests and a browser wait that
  pass alone (2026-09-24). The diffs were unrelated; every rerun passed. Dispatch three or four
  builders at a time and queue the rest; when a builder reports a timing red, read `uptime` before
  the diff.

- **`import { type A } from './x'` still imports `x` at run time under `verbatimModuleSyntax`.**
  Only `import type { A } from './x'` is erased. A cycle checker over the module graph (madge and
  the like) reads the inline-`type` form as a plain import and reports a cycle that is real, or —
  worse — a move that looks clean on the checker still keeps the runtime edge when the inline form
  slipped in. Write `import type` for type-only imports whenever a cycle matters, and grep for
  `{ type ` across the two files after a move (2026-09-24, a controller split where the first
  rewrite of the importer would have kept the cycle the PR claimed to break).
- **An env object a move introduces must be declared before the first code that can reach it.**
  A legacy `function` declaration is hoisted, so a caller that runs early never noticed the
  ordering; the moved function's arrow wrapper `(f) => info(w, f)` and its `const env = { … }`
  are not, and the first early caller meets `undefined`. Declare the env at the top of the
  closure, right after the state it closes over, not "next to the previous env" (2026-10-01, a
  journal move whose `remember` is called from a visitor machine that runs before the env line).
- **Never push `HEAD:` at the end of a chain; push the sha you gated.** A rebase-gate-push chain
  opened with `cd <worktree>`, but the shell was running in the main checkout (the harness had just
  reset its cwd after an earlier command moved it) — the gate silently ran on the stale checkout
  and `git push --force-with-lease … HEAD:<branch>` pushed that checkout's old main onto the PR
  branch, which GitHub then closed as having no commits (2026-10-01; restored from the worktree's
  detached HEAD within minutes). A `cd` at the head of a chain is not proof of where the chain
  ran: print `pwd` and `git rev-parse HEAD` in the same command as any push, push an explicit sha
  (`origin <sha>:<branch>`), lease on the sha you expect to replace, and never put a push in the
  same command as the gate whose result it depends on.
- **A gate chained after a failing setup step runs in the wrong tree and reads green; assert the
  head before trusting the exit file.** A release preview gate reused a fixed worktree path that
  was still registered from an earlier run, so `git worktree add` failed; the `cd` after it was
  `&&`-chained and did not run, but the gate was after a `;`, so it ran in the shell's current
  directory, the main checkout parked on a branch two days old, and wrote `exit=0` with 55 test
  files where the suite had 94. Only the test count gave it away. Use a fresh, uniquely named
  directory per gate, chain every step to the gate with `&&`, and print `pwd` and
  `git rev-parse HEAD` (or `test "$(git rev-parse HEAD)" = <sha>`) before the gate; read the test
  count against the last known number as well as the exit file. *(2026-10-03, the 0.12.0 release
  gate; caught before the merge.)*
- **Parallel slices that each append a section to one shared table test collide at the same line
  every time.** Five arcade slices ran in parallel on one night (2026-09-25); each extended the same
  `arcade-css.test.ts` and `arcade-tokens.test.ts` by appending a section at the end, and every second
  PR to land needed a hand rebase for exactly that hunk — three in one night, the same shape each time
  (both sides kept, one constant renamed). Give each slice its own test file from the start, or make
  the shared table a folder of per-slice files the runner globs; a shared readers list or coverage
  set is fine because it is one line that changes, not a section.


## Environments and tooling

- **Electron 44 and later do not download their binary on install.** The first `pnpm dev` dies
  with electron-vite's "Electron uninstall" error. Run `install-electron` inside the `dev` script,
  not as a `postinstall`, so the gate (typecheck, lint, unit, bundle) never pulls the ~100 MB
  binary on a CI runner. *(2026-09-30, the first toolchain slice of a fresh repo.)*
- **Pin `packageManager` in `package.json`, or corepack runs the newest pnpm it can find.** A
  brief stated the machine's pnpm version from an earlier `pnpm --version`; the shim had since
  downloaded a newer major and the builder's lockfile was written by it. Pin the exact version and
  quote it from `package.json`, not from the shell. *(2026-09-30.)*
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
- **Measure on the artifact that ships before minting a perf ticket.** A first-paint ticket was
  written from a dev-server measurement (450–600 ms against the reference's 210 ms); the built
  app already painted at 131–185 ms, under the reference on the same machine, and the proposed
  preload could not even match the font request's CORS mode under both hosts (2026-10-01). Dev
  servers pay for module graphs and HMR that the build does not. State the host next to every
  timing number; a number without its host is not a measurement.
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
- **A capture named by a time lands at the next drawn frame, so prove the observer sees the failure
  by running it on the unfixed tree first.** A "300 ms" screenshot waits for the next paint and can
  land later; a first-frame fix judged only on the fixed tree can pass because the capture missed the
  frame, not because the frame is right. Record the before/after/reference triple with mean colour or
  the text's font, and keep the "before" run as the control. *(2026-10-01, an intro first-frame fix.)*
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

- **Retitling a one-commit PR does not change what lands on main.** Under GitHub's default squash
  setting (`squash_merge_commit_title: COMMIT_OR_PR_TITLE`) a PR with a single commit squashes to that
  commit's own title; the PR's title is used only when there are two or more commits. A chair retitled
  a `fix(...)` PR to `refactor(...)` so an invisible change would cut no release, merged it, and main
  got `fix(...)` and a patch release anyway (2026-09-23). The cure is one of: pass the title explicitly
  (`gh pr merge --squash --subject "<type>(<scope>): ..."`), set the repository to `PR_TITLE`, or ask the
  builder to amend the commit. Check the setting once per repo (`gh api repos/<owner>/<repo> --jq
  .squash_merge_commit_title`) and write which applies into the repo's `CLAUDE.md` where it says what
  decides the release.
- **Brief the constraint, not the mechanism, when the mechanism is a guess.** In one night three
  briefs prescribed a mechanism the chair had reasoned out from a partial read (an exit length keyed on
  a flag; a wipe's out ended by local state; a "dims 40 %" read as brightness left), and in all three the
  builder's override — read off the code or the design's own source — was right and cheaper. The
  brief's job is the invariant (one clock, no layer left up, byte-identical off) and the evidence to
  check; when the chair states a mechanism at under about 80 %, say so and ask the builder to verify
  it first, so an override costs a paragraph and not a rebase.
- **A timestamp in a dated comment is read off the clock in the same call that writes the comment.**
  Four QC and dispatch stamps in one evening (2026-09-24) were extrapolated from an earlier read and
  landed 10–40 minutes ahead of the clock; the merge record is the comment, so a wrong stamp is a wrong
  record. `date -u` in the same command as the comment body, and when one is found wrong, correct it
  in place from the comment's own `created_at`, saying what it read before.
- **A one-property change to shared markup moves every byte-for-byte pin of a screen that draws it;
  grep the tests for the string before claiming green.** A chair's hand-fix added one inline style
  property to the board's SVG, reran the five files that name the board and posted a green QC; CI found
  two more tests pinning the exact style string, and the whole suite then found four more pinning a
  sha of whole-screen markup (2026-09-25). A partial rerun is a spot check on the files you thought of;
  the pins live where the screen is rendered, not where the component is tested. Before the claim,
  `git grep` the old string and the old sha across the tests, and run the package's whole suite once;
  when a pin moves, move it with a comment naming the change as the one move.
- **A list of test paths in one shell variable reaches the runner as one argument; read the log's first
  line before reading a non-zero exit as a red.** Twice in one afternoon (2026-09-25) a chair ran a
  mutation check as `vitest run $FILES` with several paths in `$FILES`; the runner saw one filename with
  spaces in it, found no test files and exited 1, and the chair posted "red" — once on a PR, corrected in
  place. A mutation's red is a named failing row, never an exit code. Spell the paths out as separate
  arguments (or use a shell array), and grep the log for the failing rows' names before claiming.
- **Edit a thread comment by its id, never by "the last one I wrote".** A chair keeping two running
  comments on one epic — a ledger and a "for the morning" note — used `gh issue comment --edit-last` to
  update the ledger and overwrote the morning note with it instead (2026-09-26): `--edit-last` means the
  author's most recent comment on the thread, whichever that is. Both were restored from the local
  copies through the API by comment id. When more than one of your comments on a thread is live, read
  the ids once (`gh api .../issues/<n>/comments --jq '.[] | select(.body | startswith("**Ledger")) | .id'`),
  PATCH by id, and keep the body of every running comment as a file so a wrong edit is one PATCH to undo.
- **A hand-fix runs the whole package's suite before it pushes, not the files you think it touches.** A
  chair changed two words of a HUD label (2026-09-26), ran the three test files that named the label and
  a typecheck, pushed, and CI went red on three whole-screen byte-identity pins in a fourth file that hash
  every screen — a re-pin, a second push and a second gate for a two-word change. The gate exists because
  nobody knows every pin a change reaches; skipping it on a "tiny" fix is exactly where it bites. The
  rule for a chair's hand-fix is the builder's: the package's full test run (or the gate) green locally,
  then push. Grepping for the words you changed finds the pins that quote them, never the ones that hash
  them.
- **Hold docs-only merges while a code merge's CI is running on the trunk.** A release gate that
  requires "the commit CI tested is still the trunk's head" is right when two code merges land in a row:
  the later one's CI carries both. It is wrong when the later merge is docs-only and, by the repo's own
  saving, runs no CI at all. A chair merged a `fix` at 17:24 and a docs-only PR at 17:27 (2026-09-26);
  the fix's CI went green at 17:31, the gate said "the trunk has moved, the next green head carries
  this", and no next head ever came — the fix sat merged and unreleased until a code-touching PR was
  found to push. On a merge line, either merge the docs PR first, or wait for the code merge's trunk CI
  and release to finish before it. The gate itself should learn to see a docs-only move as "nothing
  changed"; until it does, the ordering is the chair's to keep. **Read the trunk at the moment of the docs
  merge, not a few minutes before, and with your own merge loops in mind:** a background loop that merges a
  code PR on its CI green can land between the check and the docs merge. *(2026-09-27: the chair read the
  trunk idle at 17:44, a loop merged a `fix` at 17:46, the docs PR merged at 17:48 on top of its running
  CI; the fix waited for the next code head.)* Cheapest guard: stop or finish the loops first, or make the
  docs merge itself check `gh run list --branch main --limit 1` for an in-progress run and refuse.
  *(2026-09-28, third trip, and not the chair's: the approver merged a docs PR from the web UI at 00:47 on top of a `feat` whose CI had been running since 00:39; the feat waited for the next code head.)* Three trips by two people is no longer an ordering lesson: a rule that must be kept by everyone with a merge button is a mechanism that is missing. File the gate change the same day (a docs push to the trunk still runs CI when the trunk carries unreleased code, or the gate compares against the last tag) and stop relying on the humans. **Resolved 2026-09-28: a path filter belongs on the pull-request trigger, never on the release branch's push trigger, wherever a superseded-run guard exists** — a push to the trunk always runs CI, so the trunk's head always has a run for the release to follow, and the docs-only saving stays where it was (the PR's own run). One gate per docs merge is the price; the conditional form ("only when the trunk is unreleased") needs a job that reads tags before the gate and was rejected as a new mechanism with its own failure modes.
- **No parentheses in a squash subject beyond the type scope; a release tool's commit parser
  stops at the first unexpected `(` and skips the commit silently.** A `feat` whose PR title
  read `serialize(world) and hydrate(save) …` merged green, the trunk CI passed, the release
  workflow ran and reported success, and no release PR appeared: release-please logged "commit
  could not be parsed … unexpected token '('" and "Considering: 0 commits". Nothing was red. The
  repair is a one-commit docs PR carrying a `BEGIN_COMMIT_OVERRIDE … END_COMMIT_OVERRIDE` block
  that names the feat without parentheses, placed where the squash takes its body from: in that
  repo the **PR description**, not the commit message (the first try put it in the commit body
  and the release skipped it again). The rule went into the repo's mechanics. When a release step
  says success and produces nothing, read its log for "could not be parsed" before assuming it
  had nothing to do. *(2026-10-01, the serializer's release, two tries.)*
  **The parser reads the squash body as well** (2026-10-03, two more commits skipped): a body line
  that starts with a call inside a code span (`` `wrap(inner.world())` ``) is read as a footer and
  fails on the nested parenthesis. Builders' PR descriptions will always contain such lines, so
  the durable fix is at merge time, not in prose: the merger passes `--body "<Closes lines only>"`
  to `gh pr merge --squash`, the long description stays on the PR, and the parser only ever sees a
  title and a few plain lines. **An override block does not go in that flag:** release-please reads
  overrides from the merged PR's description (fetched from the forge), not from the commit
  message, so a repair edits the PR's description and re-runs the release workflow (retracted
  the same night: the merge-time body was tried first and ignored).
- **A build tool can behave differently on a tag than on a branch; pass its publish switch
  explicitly, and treat the first real release as the release path's only witness.** A packaging
  job passed on every branch and pull-request run, then failed on the first release: on a tag
  checkout the packager detected CI and tried to publish to the forge by itself, asking for a token
  the job did not have, so the upload job after it never ran and the release shipped with no files.
  Nothing on a branch could have shown it. Pass the tool's publish setting explicitly (`never` when
  another job uploads), and plan the first release as a witness: watch its run to the end and check
  the release page for the files, with a patch release ready if it fails. *(2026-10-03, the first
  release meant to carry the Windows installers.)*
- **A slice that goes straight to a PR still gets its sub-issue first.** The playbook's step 2 says
  slices are native sub-issues of their epic, and a chair that reads it still skips it when a slice
  needs no ticket of its own — the brief is written, the builder dispatched, the PR opened with
  "Part of #epic" in its body, and the parent reads 0/0 while five slices ship (2026-09-26, seven PRs
  on one epic, not one sub-issue; the approver had asked for exactly this on 2026-09-22 after two
  earlier epics). The at-a-glance progress the approver wants lives only in `sub_issues_summary`, and
  a PR is not an issue. Make the sub-issue in the same call that writes the brief:
  `gh issue create … ; gh api -X POST repos/<r>/issues/<epic>/sub_issues -F sub_issue_id=<database id>`
  — the database `id`, not the number. Retro tickets closed against their PRs repair the count, and
  cost more than doing it first.
