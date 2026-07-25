import type { Octokit } from "@octokit/rest";
import type { Env } from "../env.js";
import { CLA_RECHECK_LABEL } from "./rule.js";
import { type ClaSignature, type ClaStore, dynamoClaStore } from "./store.js";

/**
 * The HTTP half of the CLA flow, posted to by the sign form on
 * home-assistant.io: record the signature, then add the `cla-recheck` label
 * to the waiting PR so the webhook re-runs the CLA check.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function parseBody(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export async function claSignatureHandler(
  env: Env,
  octokit: Octokit,
  request: Request,
  store: ClaStore | undefined = dynamoClaStore(env),
): Promise<Response> {
  if (!store) return json(503, { message: "CLA sign flow is not configured" });

  const payload = await parseBody(request);
  if (!payload || typeof payload.github_username !== "string" || !payload.github_username) {
    return json(400, { message: "Missing required data in payload" });
  }
  const login = payload.github_username;

  const pending = await store.getPendingSigner(login);
  if (!pending) {
    return json(400, {
      message:
        `No pending request found for ${login}. Are you signing the CLA with the same ` +
        `GitHub user that created the commits in the Pull Request?`,
    });
  }

  const signature: ClaSignature = {
    ...Object.fromEntries(
      Object.entries(payload).filter(([, v]) => typeof v === "string") as [string, string][],
    ),
    github_username: login,
    received_at: new Date().toISOString(),
    ip_address: request.headers.get("x-forwarded-for") ?? "",
    user_agent: request.headers.get("user-agent") ?? "",
  };
  await store.recordSignature(signature);
  await store.deletePendingSigner(login);

  await octokit.issues.addLabels({
    owner: pending.owner,
    repo: pending.repo,
    issue_number: pending.number,
    labels: [CLA_RECHECK_LABEL],
  });

  return json(200, { message: "ok" });
}

/** OAuth code exchange backing the sign form's GitHub login. */
export async function claAuthorizeHandler(env: Env, request: Request): Promise<Response> {
  if (!env.CLA_SIGN_CLIENT_ID || !env.CLA_SIGN_CLIENT_SECRET) {
    return json(503, { message: "CLA sign flow is not configured" });
  }

  const payload = await parseBody(request);
  if (!payload || typeof payload.code !== "string" || !payload.code) {
    return json(400, { message: "Missing required data in payload" });
  }

  const params = new URLSearchParams({
    code: payload.code,
    client_id: env.CLA_SIGN_CLIENT_ID,
    client_secret: env.CLA_SIGN_CLIENT_SECRET,
  });
  const resp = await fetch(`https://github.com/login/oauth/access_token?${params.toString()}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const data = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok || "error" in data) {
    return json(400, {
      message: (data.error_description as string) ?? "Could not authorize",
    });
  }
  return json(200, data);
}
