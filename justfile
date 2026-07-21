# Command surface per https://github.com/home-assistant/architecture/discussions/1416
# Recipes wrap the pnpm scripts in package.json; run `just --list` to discover them.

# List available recipes
default:
    @just --list

# Install dependencies and prepare the checkout
setup:
    pnpm install

# Update dependencies after pulling
update:
    pnpm install

# Start the local dev server (watch mode)
run:
    pnpm run dev

# Run all linters and static checks (biome + tsc)
lint:
    pnpm run check

# Auto-format code
format:
    pnpm run format

# Run the test suite (extra args go to vitest, e.g. `just test -u`)
test *args:
    pnpm run test {{ args }}

# Run the test suite with coverage
coverage:
    pnpm run test:coverage

# Start the webhook capture server (writes raw fixtures)
capture:
    pnpm run capture

# Re-scrub existing captured webhook fixtures
scrub:
    pnpm run scrub

# Capture Discord gateway fixtures (needs DISCORD_TOKEN)
capture-discord:
    pnpm run capture-discord

# Vendor the upstream PR templates and re-render fixture bodies
sync-templates:
    pnpm run sync-templates
