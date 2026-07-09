import { createServer, type IncomingMessage, type Server } from "node:http";

export interface ServeOptions {
  port: number;
  fetch: (request: Request) => Response | Promise<Response>;
  error?: (err: unknown) => Response | Promise<Response>;
}

/**
 * Minimal HTTP server over node:http with a fetch-style Request → Response
 * handler. Request bodies are buffered — fine for webhook-sized payloads,
 * wrong for streaming uploads.
 */
export function serve(options: ServeOptions): Server {
  const server = createServer(async (req, res) => {
    let response: Response;
    try {
      response = await options.fetch(await toRequest(req));
    } catch (err) {
      response =
        (await options.error?.(err)) ?? new Response("Internal Server Error", { status: 500 });
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  return server.listen(options.port);
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body: body.length > 0 ? body : undefined,
  });
}
