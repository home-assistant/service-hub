# ha-github-bot

A Cloudflare Worker that handles GitHub webhooks for the Home Assistant organization. It automates PR labeling, CLA checking, documentation enforcement, code owner notifications, and more.

## Development

```bash
bun install
bun run dev          # Start local dev server
bun run test         # Run tests
bun run check        # Run linter + type checker
bun run format       # Auto-fix formatting
```

## TODOs

### CLA `signature_requested_at` column not populated

The `cla_pending_signers` table has a `NOT NULL` column `signature_requested_at` but the `INSERT OR REPLACE` in `pr-cla-signed.ts` does not pass a value for it. This needs discussion on whether to add a timestamp, make the column nullable, or remove it.

### CLA rule is too large

`pr-cla-signed.ts` (~250 lines) handles commit traversal, DB lookups, multiple API calls, and comment generation. Consider splitting into smaller modules (CLA check logic, comment templates, DB operations).

### Swallowed errors

Many `catch {}` blocks silently discard errors. While some are intentional (e.g., 404 on label removal), others may hide real bugs. Audit each catch block and add logging or Sentry reporting for non-benign failures.
