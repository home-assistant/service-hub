import type { NestExpressApplication } from "@nestjs/platform-express";
import { sign } from "@octokit/webhooks-methods";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

// AppConfigModule validates process.env the moment app.module.ts is
// evaluated — preset before the dynamic import (static imports would hoist
// above these assignments). Empty DISCORD_TOKEN/SENTRY_DSN keep those
// integrations off.
process.env.GITHUB_APP_ID = "1";
process.env.GITHUB_PRIVATE_KEY = "test-key";
process.env.GITHUB_INSTALLATION_ID = "1";
process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
process.env.DISCORD_TOKEN = "";
process.env.SENTRY_DSN = "";
process.env.ENVIRONMENT = "test";

const { AppModule } = await import("../src/app.module.js");
const { Test } = await import("@nestjs/testing");

const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
// Body-parser setup mirrors src/main.ts — the 1 MB limit is part of the
// webhook contract (default 100 kB rejects large GitHub deliveries).
const app = moduleRef.createNestApplication<NestExpressApplication>({
  rawBody: true,
  bodyParser: false,
});
app.useBodyParser("json", { limit: "1mb" });
app.useBodyParser("urlencoded", { extended: true, limit: "1mb" });
await app.init();
const server = app.getHttpServer();

afterAll(async () => {
  await app.close();
});

describe("server routing", () => {
  it("returns 200 for the health endpoint", async () => {
    const res = await request(server).get("/health");

    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });

  it("rejects webhook posts with an invalid signature", async () => {
    const res = await request(server)
      .post("/github/webhook")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send("{}");

    expect(res.status).toBe(401);
  });

  it("accepts webhook posts with a valid signature", async () => {
    const body = JSON.stringify({ action: "opened" });
    const signature = await sign("test-secret", body);

    const res = await request(server)
      .post("/github/webhook")
      .set("content-type", "application/json")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });

  it("accepts webhook payloads above body-parser's 100 kB default", async () => {
    const body = JSON.stringify({ action: "opened", padding: "x".repeat(150_000) });
    const signature = await sign("test-secret", body);

    const res = await request(server)
      .post("/github/webhook")
      .set("content-type", "application/json")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
  });

  it("returns 404 for anything else", async () => {
    const res = await request(server).get("/nope");

    expect(res.status).toBe(404);
  });

  it("503s the CLA sign endpoint when the store is unconfigured", async () => {
    const res = await request(server)
      .post("/cla-sign")
      .set("content-type", "application/json")
      .send({ github_username: "alice" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "CLA sign flow is not configured" });
  });

  it("503s the CLA authorize endpoint when OAuth creds are unconfigured", async () => {
    const res = await request(server)
      .post("/cla-sign/authorize")
      .set("content-type", "application/json")
      .send({ code: "abc" });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ message: "CLA sign flow is not configured" });
  });
});
