# ha-github-bot

A Node.js service that automates the Home Assistant organization's GitHub repos and Discord guilds. Two engines share the process, cleanly separated under `src/github/` and `src/discord/`: the GitHub engine handles webhooks (PR labeling, documentation enforcement, code owner notifications, dashboard checks), the Discord engine handles gateway events (slash commands, message listeners). CLA checking is handled by the legacy bot in `service-hub/github-bot`.

## Development

```bash
npm install
npm run dev          # Start local dev server
npm test             # Run tests
npm run check        # Run linter + type checker
npm run format       # Auto-fix formatting
```

## Webhook subscriptions

The GitHub App only needs four event subscriptions: **Issues**, **Issue comment**, **Pull request**, and **Pull request review**. Everything else is dropped at the door (`KNOWN_EVENT_TYPES` in `src/github/webhook.ts`) — in particular CI events (workflow runs/jobs, check runs/suites) and pushes are pure noise today and make up the vast majority of delivery volume, so leave them unsubscribed. Some subscriptions will become necessary for planned work (see TODOs): **Workflow run** and **Check run** for the CI-job-failure rules and for reading job results like `detect-non-english-issues` as flags, and **Pull request review comment** + **Pull request review thread** to re-run the `review-comments` rule the moment an inline comment is replied to, acknowledged, or resolved — today that rule only refreshes on PR-level events and the cron sweep.

## Overriding a dashboard check

Failing or pending checks on the bot's PR dashboard can be waived with the `/ha-bot ignore "<check name>" "<reason>"` comment command, using the check's display title from the dashboard table. Under the hood the command appends `<!-- ha-bot:ignore id="<section-id>" reason="<why>" -->` to the PR description, which is the single source of truth for overrides — removing the tag from the description un-waives the check. Only `fail` and `pending` sections can be downgraded — they become `warn`, which stays visible in the checks table with a warning triangle but no longer fails the aggregate; other statuses ignore the tag. The original check message stays visible with an `Override: <reason>` line appended, so reviewers can see both what was flagged and why it was waived.

## Rule context and entity model

Rules never see raw webhook payloads. Each dispatch hands them a `RuleContext`: an event descriptor (what happened — event type plus per-event facts like the changed label) and lazily-hydrated read-models (`PullRequest`, `Issue`, `Repo`, `Org`). Entities are seeded with whatever the triggering payload carried; any field the source lacked is fetched on first read through per-endpoint cache groups (core `pulls.get`, files, reviews, review comments, issue comments), costing at most one request per group per dispatch no matter how many rules read it. `src/github/engine/model/from-webhook.ts` is the only file that knows payload shapes.

## Label loop

Rules communicate through labels: one rule's `addLabels`/`removeLabels` effect can be another rule's `labeled`/`unlabeled` trigger, so a rule only needs to listen for the events it actually cares about instead of every PR event. On each dispatch the engine simulates label changes in memory, re-dispatches the affected rules with synthetic `labeled`/`unlabeled` events (same entity, label state overridden), and repeats until the label set stabilizes. Only then are effects applied — with label effects collapsed to the net diff, so a label added and removed within one dispatch never flickers on GitHub, and labels already present aren't re-sent. Non-converging rule sets are cut off after 10 rounds and reported to Sentry.

## Commands

Commenting `/<slug> <command> ["<arg>" …]` on a PR or issue invokes a command (e.g. `/ha-bot rename "New title"`); every argument is wrapped in double quotes, and the dispatcher hands them to the handler unquoted. Commands are declared per repo in the manifest next to the rules and, like rules, return effects rather than calling GitHub directly — a command's label changes run through the label loop, so label-triggered rules react to them immediately (the bot's own mutations arrive as self-webhooks, which are dropped). Each command declares its constraints — argument requirement, PR/issue scope, and permission tier (`none`, `code_owner` for the labeled integration's manifest code owners, `member` for org members) — which the dispatcher enforces before the handler runs. The invoking comment gets a 👍 reaction on success and a 👎 when the command is unknown, malformed, out of scope, denied, or fails.

## Webhook fixture snapshots

Because rules (and commands) interact through the label loop, a change to one rule can alter side-effects far away from it. `test/github/manifests/` pins this down: every fixture in `test/github/manifests/fixtures/<repo>/` is a **real captured GitHub webhook payload**, replayed through the real manifest registry — full pipeline, label loop included — with the resulting effect list pinned in a `<name>.expected.yaml` sidecar. If a rule change alters what the bot would do for any covered delivery, the diff shows it. Review such diffs deliberately and regenerate with `UPDATE_FIXTURES=1 npm test`.

To capture new fixtures, run `npm run capture` (a server that writes every delivery to `test/github/manifests/fixtures/_captured/`), point a tunnel at it (`npx smee-client --url <smee channel> --target http://localhost:8787/github/webhook`), and perform the actions on a repo the bot app is installed on. Deliveries are scrubbed as they land: the capture repo (read from the payload's own `repository` block) maps onto the canonical repo, the capturing user becomes a generic `contributor`, and opaque identifiers are blanked while keeping their shape. Copy the interesting captures into `fixtures/<repo>/` named `<event>.<action>[.variant].json` — the harness derives the delivery's event type from the filename, since GitHub sends it in a header, not the payload. `npm run scrub` re-normalizes everything already under `fixtures/<repo>/`. An optional `<name>.state.json` sidecar stubs the world outside the payload: the PR's changed files, `mergeable_state`, CODEOWNERS content, and remote JSON endpoints (integration manifests, analytics).

### PR template coupling

Several rules parse the PR body, so fixture bodies must track the repo's real PR template. `npm run sync-templates` vendors each fixture repo's live `.github/PULL_REQUEST_TEMPLATE.md` into `fixtures/<repo>/_templates/`, and `npm run update-fixture-bodies` re-renders every fixture that has a `<name>.body.json` fill file (which checkboxes the contributor ticked, what prose goes under which heading) from that template — failing loudly if a referenced checkbox or heading no longer exists. The synthetic `pull_request.opened.all-change-types` fixture ticks every type-of-change box, so a template rewording of *any* option drops a label from its expected effects even when no other fixture exercises that option. Intended flow: a scheduled workflow runs sync + update + tests and opens a PR when the upstream template changed — its diff shows the template change, the regenerated bodies, and any effect fallout in one place.

## Discord engine

`src/discord/` is the message engine: the Discord counterpart of the GitHub rules engine, ported from the legacy bot. The same philosophy applies — handlers never see discord.js objects. The gateway adapter (`src/discord/engine/gateway.ts`, the only file that imports discord.js) normalizes gateway events into plain serializable events, and handlers return `DiscordEffect`s (`reply`, `showModal`, `autocomplete`, `sendMessage`, `deleteMessage`) that an applier executes through ports the adapter implements.

What runs where is declared per guild in `src/discord/manifests/` (mirroring the GitHub repo manifests): slash commands and gateway listeners, with the common set spread into each guild. On startup the gateway replaces each manifest guild's registered slash commands with the manifest's, so stale commands from earlier deploys drop off. A command that opens a modal also owns the submit — modal `customId`s are prefixed `<command>:` and routed back by that prefix.

The gateway only starts when `DISCORD_TOKEN` is set; without it the bot is GitHub-only. The reverse direction — GitHub rules emitting Discord notifications — is deliberately not wired up yet: see the commented `notify` effect in `src/github/engine/types.ts`.

### Discord fixture snapshots

`test/discord/manifests/` mirrors the GitHub webhook fixture suite: every fixture in `fixtures/<guild>/` is a normalized Discord event replayed through the real guild registry — routing, error handling, and default acknowledgement included — with the resulting effect list snapshotted. A `<name>.state.json` sidecar stubs the world outside the event (remote JSON/YAML endpoints, pinned messages). To capture real events, run `npm run capture-discord` with a `DISCORD_TOKEN` for a test bot: it starts the full gateway (commands register and answer) and additionally writes every normalized event to `fixtures/_captured/`.

## TODOs

- On every webhook, save which PR is looked at. At the cron check, only run on-demand for PRs that haven't been looked at (if any)
- Update the Discord message path inside `src/discord/commands/info.ts`

### CLA Check
- Add CLA Check
- CLA Check: add github ID in addtion to github handle (can change)
- CLA Check: confirm user ID in `/cla-sign` via a short-lived token provided by `/cla-sign/authorize` (right now anyone can sign for a different user with a custom POST, as long as the user has a pending CLA sign)
- CLA Check: revoke and discard github token already in `/cla-sign/authorize` and only send back the form fields to the frontend.

### Discord
- Enable the `notify` effect (GitHub rules → Discord messages) once the Discord engine runs in production
- Slack: decide whether it becomes a second adapter behind the message engine
- Discord: addReaction effect (not needed by the ported legacy features)
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
- Some kind of notification system to core developers to look at PRs which haven't gotten a response for more than x days (e.g. 1 or 2 months). Maybe auto assign on a rotation basis to core developers which are then responsible for that PR? Could be an issue dashboard or epic? 
- Check if awaiting-frontend / awaiting-backend could be automated?
- If an arch discussion is linked, check if it has been aproved. Put the PR in draft until it is approved.
- Create a comment if person force pushes to PR 'Please do not force push'.