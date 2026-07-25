import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";

// Boot the real server: preset env wins over any local `.env`, PORT=0 picks a
// free port, and empty DISCORD_TOKEN/SENTRY_DSN keep those integrations off.
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_PRIVATE_KEY = "test-key";
process.env.GITHUB_INSTALLATION_ID = "1";
process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
process.env.DISCORD_TOKEN = "";
process.env.SENTRY_DSN = "";
process.env.ENVIRONMENT = "test";
process.env.PORT = "0";

const { server } = await import("../src/server.js");
if (!server.address()) await new Promise((resolve) => server.once("listening", resolve));
const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

afterAll(() => {
  server.close();
});

describe("server routing", () => {
  it("returns 200 for the health endpoint", async () => {
    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("routes webhook posts to the webhook handler", async () => {
    const res = await fetch(`${baseUrl}/github/webhook`, {
      method: "POST",
      body: "{}",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
    });

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid signature");
  });

  it("returns 404 for anything else", async () => {
    const res = await fetch(`${baseUrl}/nope`);

    expect(res.status).toBe(404);
  });
});
