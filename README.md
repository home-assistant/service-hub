# ha-github-bot

A Cloudflare Worker that handles GitHub webhooks for the Home Assistant organization. It automates PR labeling, documentation enforcement, code owner notifications, and more. CLA checking is handled by the legacy bot in `service-hub/github-bot`.

## Development

```bash
bun install
bun run dev          # Start local dev server
bun run test         # Run tests
bun run check        # Run linter + type checker
bun run format       # Auto-fix formatting
```

## Overriding a dashboard check

Failing or pending checks on the bot's PR dashboard can be overridden by adding a tag to the PR description, with an explanation of why this PR doesn't need to satisfy the rule:

```html
<!-- ha-bot:ignore id="<section-id>" reason="<why this PR is an exception>" -->
```

The `id` is the section ID shown in the dashboard's machine-readable markers (e.g. `merge-conflict`, `docs-missing`). Only `fail` and `pending` sections can be downgraded; `pass`/`info` checks ignore the tag. The original check message stays visible in the dashboard with an `Override: <reason>` line appended, so reviewers can see both what was flagged and why it was waived.

## TODOs

- Add sentry logging
- On every webhook, save which PR is looked at. At the cron check, only run on-demand for PRs that haven't been looked at (if any)


### More HA rules
- fail: pr-description template is not followed
- fail: merge conflicts exist
- fail/info: if there are CI job failures. Depends on the job (prek should fail, tests should fail if single integretion and integration test fails - otherwise info)
- fail: if they have more than 5 open PRs. New contributors are limited to 1 unless given permissions for another one (add label to new PR). Members are exempted

- fail: if prior comments are still unresolved/haven't been acknowledged (reaction, comment or 'resolved')
- fail: if new-feature but no new tests
- info: if they add more than one platform for a new-integration
- info: if they touch more than one integration. Members are exempted
- linked PRs should be cross-linked. If the other PR doesn't link to this one (like for docs) flag it
- info: if maintainer_can_modify is not enabled

- convert other github/ci jobs into messages like `detect-non-english-issues`. These jobs should set flags which our bot can read instead.
- info: they touched 'meta files': a pr should only touch a single meta file or no meta file. e.g. Agents.md, lock files, github actions, etc
