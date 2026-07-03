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

## Label loop

Rules communicate through labels: one rule's `addLabels`/`removeLabels` effect can be another rule's `labeled`/`unlabeled` trigger, so a rule only needs to listen for the events it actually cares about instead of every PR event. On each dispatch the engine simulates label changes in memory, re-dispatches the affected rules with synthetic `labeled`/`unlabeled` events (sharing the request caches of the original context), and repeats until the label set stabilizes. Only then are effects applied — with label effects collapsed to the net diff, so a label added and removed within one dispatch never flickers on GitHub, and labels already present aren't re-sent. Non-converging rule sets are cut off after 10 rounds and reported to Sentry.

## TODOs

- Think of a better cache mechanism - maybe seperate from the webhookcontext? Seems overloaded.
- On every webhook, save which PR is looked at. At the cron check, only run on-demand for PRs that haven't been looked at (if any)
- Fix pr-platinum-code-owner-approval, pr-new-integration-validation, and pr-has-docs-pr to update on PR creation
- Add sentry logging
- Check what happens when a dispatch for a PR is currently running, but a new webhook enters for the same PR. We should probably queue those, such that a later webhook can't finish before an earlier one.

### CLA Check
- Add CLA Check
- CLA Check: add github ID in addtion to github handle (can change)
- CLA Check: confirm user ID in `/cla-sign` via a short-lived token provided by `/cla-sign/authorize` (right now anyone can sign for a different user with a custom POST, as long as the user has a pending CLA sign)
- CLA Check: revoke and discard github token already in `/cla-sign/authorize` and only send back the form fields to the frontend.

### Discord
- Add Slack/Discord commands
- Create Slack/Discord effects (sendMessage, deleteMessage, addReaction...)
- Discord: Update the dashboard with discord links or the thread or message if the issue/pr has been mentioned there.
- Discord: Send a discord message when nightly build or dev CI fails.
- Discord: Send a discrod message when a flaky test is detected with a threshold (failed more than x times last month).

### More HA rules
- fail: pr-description template is not followed
- fail/info: if there are CI job failures. Depends on the job (prek should fail, tests should fail if single integretion and integration test fails - otherwise info)
- fail: if they have more than 5 open PRs. New contributors are limited to 1 unless given permissions for another one (add label to new PR). Members are exempted
- fail: if architecture proposal is included but it hasn't been approved yet

- fail: keep markdown frontmatter between user docs and integration code in sync (e.g. code owners - require a docs PR if code owners change)
- fail: if prior comments are still unresolved/haven't been acknowledged (reaction, comment or 'resolved')
- fail: if new-feature but no new tests
- info: if they add more than one platform for a new-integration
- info: if they touch more than one integration. Members are exempted
- linked PRs should be cross-linked. If the other PR doesn't link to this one (like for docs) flag it
- info: if maintainer_can_modify is not enabled

- convert other github/ci jobs into messages like `detect-non-english-issues`. These jobs should set flags which our bot can read instead.
- info: they touched 'meta files': a pr should only touch a single meta file or no meta file. e.g. Agents.md, lock files, github actions, etc
- Have a list of 'legacy' integrations which should not be worked on until something has been fixed. E.g. https://github.com/home-assistant/core/pull/163497 (According to ADR 7 this is required before new features can be accepted for an integration.)