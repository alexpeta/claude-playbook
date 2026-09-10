# Recipe — the project board through `gh`

`gh project item-list` truncates past 1000 items and silently drops the newest — never use it
for lookups. Per-issue GraphQL instead:

```
ID=$(gh api graphql -f query='{ repository(owner:"<o>", name:"<r>") { issue(number: <n>) {
  projectItems(first: 5) { nodes { id project { number } } } } } }' \
  --jq '.data.repository.issue.projectItems.nodes[]|select(.project.number==<P>)|.id')
gh project item-edit --id "$ID" --project-id <PVT_…> --field-id <PVTSSF_…> --single-select-option-id <opt>
```

- New issues are NOT auto-added: `gh project item-add <P> --owner <o> --url <issue url>`, then
  set Status. Record the field and option ids in the project's memory; re-verify them after
  the board changes.
- Transitions: In progress at dispatch, In review when the PR is up, Done is automatic on close.
- Sub-issues: `gh api --method POST repos/<o>/<r>/issues/<epic>/sub_issues -F sub_issue_id=<db id>`
  — `-F` (typed int), not `-f`; the db id is `gh api repos/<o>/<r>/issues/<n> --jq .id`.
- Labels as repeated `-l` flags, never an unquoted shell variable (zsh won't word-split it).
- Inside a `for` loop, build the GraphQL query with escaped quotes and `set --`-free
  parsing; a mangled query fails silently as "no item".
