# Reader tier

> A cheap model turns bulk text into structure with locations; the expensive seat reads only what
> it gates or edits. Added 2026-09-14 after a transcript measurement showed the cost of a long
> context is paid on every later call, so what enters a context matters more than what is read once.

## When

- The chair's PR intake: a diff over ~1,500 lines, a PR body over ~150 lines, a transcript.
- A builder's orientation: the DACI, a held PR's diff, the brief's cited files — the reads that
  happen in the first twenty calls and ride the whole build.
- Log tails, corpus scans, census re-derivations whose output is a table.

## Never

- The read that decides: the chair reads the hunks it gates on; the builder reads the lines it
  edits. A reader's line numbers are a map, not the territory.
- Judgement: a reader that "spots the bug" is narrating. It lists; the expensive seat judges.

## Shapes

**QC diff index** (`Explore`, `model: haiku`, read-only): "Read `git diff <base>...<head>` for
PR #N. Return, and nothing else: (1) per file, functions/classes ADDED and REMOVED with line
ranges in the head; (2) tests deleted by name; (3) every `"event": "…"` literal added or removed
with file:line; (4) every pinned count that changed (a number in an assert), old → new,
file:line; (5) the three largest hunks by lines with their file and range. No summaries of
intent." The chair then reads (5) and whatever (1)–(4) makes it want to see, in full.

**Brief orientation digest** (`Explore`, `model: haiku`): "Read `docs/decisions/NNNN-….md` and
`git show pr/N:<path>` for these paths. Return: the numbered decisions, each in one sentence
with its section anchor; the public names each file defines with line ranges; nothing else."
The brief quotes the digest's anchors; the builder still reads the code it edits.

**Log/corpus triage**: "Read the file. Return every line matching <pattern> with its line
number, grouped by <key>; a count per group; nothing else."

## Measure it

Same seat, same task class, with and without the reader, read off the session's per-model
lines (`/usage` Session block on a subscription; the console on API billing): the expensive
model's uncached input + cache writes are what a reader removes. Keep the reader's own line
beside it. Report the two numbers; keep the reader only where the pair says so.
