/**
 * Webhook capture server for seeding test/manifests fixtures from real
 * GitHub deliveries. Point a tunnel (e.g. smee.io) at
 * http://localhost:8787/github/webhook, perform actions on a repo the bot
 * app is installed on, and every delivery lands in the capture directory as
 * `<event>.<action>-<delivery-id>.json` — the raw payload, ready to be
 * renamed into test/manifests/fixtures/<repo>/ (the harness derives the
 * event type from the `<event>.<action>` filename prefix).
 *
 * Usage: bun scripts/capture-webhooks.ts [output-dir]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const port = Number(process.env.PORT ?? 8787);
const outDir = process.argv[2] ?? "test/manifests/fixtures/_captured";
mkdirSync(outDir, { recursive: true });

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/github/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    const event = request.headers.get("x-github-event") ?? "unknown";
    const delivery = request.headers.get("x-github-delivery") ?? String(Date.now());
    const body = await request.text();

    let action = "none";
    try {
      action = JSON.parse(body).action ?? "none";
    } catch {
      // keep "none"; still save the body for inspection
    }

    const file = join(outDir, `${event}.${action}-${delivery}.json`);
    await Bun.write(file, body);
    console.log(`captured ${event}.${action} -> ${file}`);
    return new Response("OK");
  },
});

console.log(`capturing webhooks on http://localhost:${port}/github/webhook -> ${outDir}/`);
