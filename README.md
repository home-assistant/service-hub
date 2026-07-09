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