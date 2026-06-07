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

## TODOs

- Add sentry logging
- pr-type-labels: should be renamed to pr-label-type and should be split up (needs a closer look)

### More HA rules
- Close PR if they have more than 5 open PRs. New contributors are limited to 1 unless given permissions for another one.

- put into draft if merge conflicts exist
- put into draft/warn if there are CI job failures. Depends on the job (prek/tests should fail)
- draft if pr-description template is not followed
- draft if new-feature but no new tests
- draft if prior comments are still unresolved/haven't been acknowledged (reaction, comment or 'resolved')
- Warn user if they add more than one platform for a new-integration
- Warn user if they touched 'meta files': a pr should only touch a single meta file or no meta file. e.g. Agents.md, lock files, github actions, etc
- Warn user if they touch more than one integration
- convert other github/ci jobs into messages like `detect-non-english-issues`. These jobs should set flags which our bot can read instead.
- linked PRs should be cross-linked. If the other PR doesn't link to this one (like for docs) flag it

- members get treated differently and some rules don't apply to them (e.g. touching more than one integration, more than 5 PRs open)
- Any bot warning/error can be removed by adjusting the PR description with a comment and tagging it appropriatly (so the bot sees it). The comment should be an explanation of why this PR is an exception to the rule.