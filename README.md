# OHF Bots

A Node.js service running the GitHub and Discord bots for Open Home Foundation projects like the Home Assistant and ESPHome. Two engines share the process, separated under `src/github/` and `src/discord/`: the GitHub engine handles webhooks (rules and slash commands), the Discord engine handles gateway events (slash commands, message listeners).

## Development

Common tasks are exposed as [`just`](https://just.systems) recipes:

```bash
just setup           # Install dependencies
just run             # Start local dev server
just test            # Run tests
just lint            # Run linter + type checker
just format          # Auto-fix formatting
```

`just --list` shows all recipes; they are thin wrappers around the pnpm scripts in `package.json`, which work directly too (`pnpm run dev`, …). Under the hood, `pnpm` is used as the package manager.

## Running locally against a fork

The bot only acts on the repositories listed in `src/github/manifests/`, so to exercise it end-to-end without touching a production repo you point it at a **fork you own**. The loop is: a GitHub App on your fork sends webhooks → [smee.io](https://smee.io) tunnels them to your laptop → the local server evaluates its rules and calls back into the fork.

### 1. Create a GitHub App

Create a personal GitHub App under **Settings → Developer settings → GitHub Apps → New GitHub App** (this can be a user-owned app; org ownership is only needed for the team-expansion permission below).

- **Webhook URL** — the smee channel from step 2 (you can fill this in after creating the channel; the path the server listens on is `/github/webhook`).
- **Webhook secret** — generate a random string; it goes into `GITHUB_WEBHOOK_SECRET`.
- **Private key** — after creating the app, generate a private key and download the `.pem`; it goes into `GITHUB_PRIVATE_KEY`.

**Repository permissions:**

| Permission | Level | Why |
|---|---|---|
| Metadata | Read | Mandatory baseline for all repo access |
| Issues | Read & Write | Labels, assignees, comments, reactions, title/state |
| Pull requests | Read & Write | Files/reviews/commits, request reviewers, dismiss review, update branch |
| Contents | Read | Fetch `CODEOWNERS` |
| Commit statuses | Read & Write | The dashboard status the bot posts on each PR |

**Subscribe to events:** `Issues`, `Issue comment`, `Pull request`, `Pull request review`.

> **Team-expansion rules can't be tested on a personal fork.** The code-owner rules resolve `@org/team` refs and org membership against the *fork owner's* org (the bot passes `repo.owner` as the org — see `rule-context.ts`), not `home-assistant`. A `CODEOWNERS` entry like `@home-assistant/foo` won't match a `yourname/` fork and is left unexpanded; membership checks against your personal account just return false. These lookups fail closed, so nothing crashes — the rules simply no-op. Exercising them for real needs the fork inside an org whose own teams its `CODEOWNERS` references, with the app installed there and granted org **Members: Read**.

After creating the app, **install it on your fork** (GitHub App page → Install App → select the fork). The install page URL ends in `/installations/<id>` — that number is your `GITHUB_INSTALLATION_ID`. The app's numeric ID (App settings → "App ID") is `GITHUB_APP_ID`.

### 2. Set up smee

GitHub can't reach `localhost`, so tunnel deliveries through smee:

```bash
# Get a channel URL from https://smee.io/new, then:
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:8787/github/webhook
```

Use that same `https://smee.io/<your-channel>` URL as the GitHub App's **Webhook URL**. Leave the tunnel running alongside `just run`; every delivery GitHub sends will be forwarded to the local server.

> The webhook secret and installation must match, or deliveries are rejected with `401 Invalid signature` — check the smee output and the app's "Advanced → Recent Deliveries" tab if events don't arrive.

### 3. Point the bot at your fork

Rules are keyed by the repository's canonical `owner/repo` slug. To run an existing repo's rule set against your fork instead, add your fork's slug to that manifest's `aliases`. The core manifest already carries a placeholder for exactly this:

```ts
// src/github/manifests/home-assistant-core/index.ts
export const homeAssistantCore: RepoManifest = {
  slug: HomeAssistantRepository.CORE,
  aliases: ["yourname/core"], // ← change to your fork's owner/repo
  ...
};
```

The fork then shares the exact same rule instances as the real repo — no duplication. Aliases are validated at boot: a slug claimed by two manifests fails loudly on startup.

### 4. Configure `.env` and run

Copy `.env.example` to `.env` and fill in the values gathered above:

```bash
cp .env.example .env
# GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_WEBHOOK_SECRET, GITHUB_PRIVATE_KEY
```

The `GITHUB_PRIVATE_KEY` must be on one line with `\n` for newlines (see the comment in `.env.example`). Then:

```bash
just run   # dev server on http://localhost:8787, watch mode
```

Open or label a PR/issue on your fork and the delivery should flow smee → server → back to the fork. `GET /health` returns `OK` for a quick liveness check.

### Capturing fixtures

`just capture` runs a standalone server that records real GitHub deliveries into scrubbed test fixtures — point the same smee tunnel at it instead of the dev server. See `scripts/capture-webhooks.ts` for the workflow.
