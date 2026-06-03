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

### Swallowed errors

Many `catch {}` blocks silently discard errors. While some are intentional (e.g., 404 on label removal), others may hide real bugs. Audit each catch block and add logging or Sentry reporting for non-benign failures.

### More HA rules
- put into draft if merge conflicts exist
- Warn user if they have more than 5 open PRs
- put into draft/warn if there are CI failures. Depends on the job (prek/tests should fail, )
- draft if pr-description template is not followed
- draft if new-feature but no new tests
- draft if prior comments are still unresolved/haven't been acknowledged (reaction, comment or 'resolved')
- Warn user if they add more than one platform for a new-integration
- Warn user if they touched 'meta files': a pr should only touch a single meta file or no meta file. e.g. Agents.md, lock files, github actions, etc
- Warn user if they touch more than one integration
- convert other github/ci jobs into messages like `detect-non-english-issues`. These jobs should set flags which our bot can read instead.

- members get treated differently and some rules don't apply to them (e.g. touching more than one integration, more than 5 PRs open)
- Any bot warning/error can be removed by adjusting the PR description with a comment and tagging it appropriatly (so the bot sees it). The comment should be an explanation of why this PR is an exception to the rule.