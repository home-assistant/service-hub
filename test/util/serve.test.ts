import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { serve } from "../../src/util/serve.js";

const servers: Server[] = [];

async function start(options: Omit<Parameters<typeof serve>[0], "port">): Promise<string> {
  const server = serve({ port: 0, ...options });
  servers.push(server);
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

describe("serve", () => {
  it("passes method, path, headers, and body through to the handler", async () => {
    let seen: { method: string; path: string; header: string | null; body: string } | undefined;
    const base = await start({
      fetch: async (request) => {
        seen = {
          method: request.method,
          path: new URL(request.url).pathname,
          header: request.headers.get("x-hub-signature-256"),
          body: await request.text(),
        };
        return new Response("created", { status: 201, headers: { "x-answer": "42" } });
      },
    });

    const res = await fetch(`${base}/github/webhook`, {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=abc" },
      body: '{"action":"opened"}',
    });

    expect(seen).toEqual({
      method: "POST",
      path: "/github/webhook",
      header: "sha256=abc",
      body: '{"action":"opened"}',
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("x-answer")).toBe("42");
    expect(await res.text()).toBe("created");
  });

  it("passes bodyless GET requests through", async () => {
    const base = await start({
      fetch: (request) => new Response(request.body === null ? "OK" : "unexpected body"),
    });

    const res = await fetch(`${base}/health`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });

  it("routes handler errors through the error callback", async () => {
    const base = await start({
      fetch: () => {
        throw new Error("boom");
      },
      error: (err) => new Response(`caught: ${(err as Error).message}`, { status: 500 }),
    });

    const res = await fetch(base);

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("caught: boom");
  });

  it("responds 500 when a handler error has no error callback", async () => {
    const base = await start({
      fetch: () => {
        throw new Error("boom");
      },
    });

    const res = await fetch(base);

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal Server Error");
  });
});
