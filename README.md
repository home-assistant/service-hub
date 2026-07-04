# ha-github-bot

A Bun server that handles GitHub webhooks for the Home Assistant organization. It automates PR labeling, documentation enforcement, code owner notifications, and more. CLA checking is handled by the legacy bot in `service-hub/github-bot`.

## Development

```bash
bun install
bun run dev          # Start local dev server
bun run test         # Run tests
bun run check        # Run linter + type checker
bun run format       # Auto-fix formatting
```

## Webhook subscriptions

The GitHub App only needs four event subscriptions: **Issues**, **Issue comment**, **Pull request**, and **Pull request review**. Everything else is dropped at the door (`KNOWN_EVENT_TYPES` in `src/index.ts`) — in particular CI events (workflow runs/jobs, check runs/suites) and pushes are pure noise today and make up the vast majority of delivery volume, so leave them unsubscribed. Some subscriptions will become necessary for planned work (see TODOs): **Workflow run** and **Check run** for the CI-job-failure rules and for reading job results like `detect-non-english-issues` as flags, and **Pull request review comment** + **Pull request review thread** to re-run the `review-comments` check the moment an inline comment is replied to, acknowledged, or resolved — today that check only refreshes on PR-level events and the cron sweep.

## Overriding a dashboard check

Failing or pending checks on the bot's PR dashboard can be overridden by adding a tag to the PR description, with an explanation of why this PR doesn't need to satisfy the rule:

```html
<!-- ha-bot:ignore id="<section-id>" reason="<why this PR is an exception>" -->
```

The `id` is the section ID shown in the dashboard's machine-readable markers (e.g. `merge-conflict`, `docs-missing`). Only `fail` and `pending` sections can be downgraded; `pass`/`info` checks ignore the tag. The original check message stays visible in the dashboard with an `Override: <reason>` line appended, so reviewers can see both what was flagged and why it was waived.

## Rule context and entity model

Rules never see raw webhook payloads. Each dispatch hands them a `RuleContext`: an event descriptor (what happened — event type plus per-event facts like the changed label) and lazily-hydrated read-models (`PullRequest`, `Issue`, `Repo`, `Org`). Entities are seeded with whatever the triggering payload carried; any field the source lacked is fetched on first read through per-endpoint cache groups (core `pulls.get`, files, reviews, review comments, issue comments), costing at most one request per group per dispatch no matter how many rules read it. `src/engine/model/from-webhook.ts` is the only file that knows payload shapes.

## Label loop

Rules communicate through labels: one rule's `addLabels`/`removeLabels` effect can be another rule's `labeled`/`unlabeled` trigger, so a rule only needs to listen for the events it actually cares about instead of every PR event. On each dispatch the engine simulates label changes in memory, re-dispatches the affected rules with synthetic `labeled`/`unlabeled` events (same entity, label state overridden), and repeats until the label set stabilizes. Only then are effects applied — with label effects collapsed to the net diff, so a label added and removed within one dispatch never flickers on GitHub, and labels already present aren't re-sent. Non-converging rule sets are cut off after 10 rounds and reported to Sentry.

## Commands

Commenting `/<slug> <command> [args]` on a PR or issue invokes a command (e.g. `/ha-bot rename New title`). Commands are declared per repo in the manifest next to the checks and, like checks, return effects rather than calling GitHub directly — a command's label changes run through the label loop, so label-triggered checks react to them immediately (the bot's own mutations arrive as self-webhooks, which are dropped). Each command declares its constraints — argument requirement, PR/issue scope, and permission tier (`none`, `code_owner` for the labeled integration's manifest code owners, `member` for org members) — which the dispatcher enforces before the handler runs. The invoking comment gets a 👍 reaction on success and a 👎 when the command is unknown, malformed, out of scope, denied, or fails.

## Webhook fixture snapshots

Because rules (and commands) interact through the label loop, a change to one rule can alter side-effects far away from it. `test/manifests/` pins this down: every fixture in `test/manifests/fixtures/<repo>/` is a **real captured GitHub webhook payload**, replayed through the real manifest registry — full pipeline, label loop included — with the resulting effect list snapshotted. If a rule change alters what the bot would do for any covered delivery, the snapshot diff shows it. Review such diffs deliberately and regenerate with `bun test --update-snapshots`.

To capture new fixtures, run `bun run capture` (a server that writes every delivery to `test/manifests/fixtures/_captured/`), point a tunnel at it (`npx smee-client --url <smee channel> --target http://localhost:8787/github/webhook`), and perform the actions on a repo the bot app is installed on. Copy the interesting captures into `fixtures/<repo>/` named `<event>.<action>[.variant].json` — the harness derives the delivery's event type from the filename, since GitHub sends it in a header, not the payload. An optional `<name>.state.json` sidecar stubs the world outside the payload: the PR's changed files, `mergeable_state`, CODEOWNERS content, and remote JSON endpoints (integration manifests, analytics).

## TODOs

- On every webhook, save which PR is looked at. At the cron check, only run on-demand for PRs that haven't been looked at (if any)
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