## QC read — __STAMP__ → merge

**Read (chair, <date>, head <sha>):** full diff (<lines>, <files>). <What the change is, in
the reviewer's own words, quoting the code; every design call the builder made and whether the
chair accepts it, with a percentage where it is a judgment; what the builder found that the
brief got wrong; found-not-fixed items and the tickets they became; what the merge order
implies for neighbouring PRs.>

**Gates:**
| leg | result |
|---|---|
| builder, keyless gate (head <sha>) | exit 0 — <n> passed, cov <x> % |
| builder, integration tier (<where, on which head>) | exit 0 — <n> passed |
| chair, keyless gate, detached at `__HEAD__` in the main tree | **exit __EXIT__ — __USUM__, __COV__** |
| CI `test` / `integration` | __CI__ / __INTEG__ |
| chair, keyless gate on the PR MERGED onto current main (preview gate) | **__PREVIEW__** |

**Merged under the standing grant (<the grant, dated and quoted>).** Written by an **Opus
builder** (`model: opus`, worktree-isolated) from the #<n> brief; QC'd and gated by the chair.
