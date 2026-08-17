import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { Octokit } from "@octokit/rest";
import { ENV, type Env } from "../env.js";
import { OCTOKIT } from "../github/octokit.provider.js";
import { CLA_RECHECK_LABEL } from "./rule.js";
import type { ClaSignature, ClaStore } from "./store.js";
import { CLA_STORE } from "./store.provider.js";

/**
 * The HTTP half of the CLA flow, posted to by the sign form on
 * home-assistant.io: record the signature, then add the `cla-recheck` label
 * to the waiting PR so the webhook re-runs the CLA check.
 *
 * Bodies are validated here, not in pipes — the sign form relies on these
 * exact status/JSON contracts, so errors go out via `HttpException(body,
 * status)` with the same shapes as before the NestJS port.
 */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

@Injectable()
export class ClaService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(OCTOKIT) private readonly octokit: Octokit,
    @Inject(CLA_STORE) private readonly store: ClaStore | undefined,
  ) {}

  async sign(payload: unknown, ipAddress: string, userAgent: string): Promise<{ message: string }> {
    const store = this.store;
    if (!store) throw new HttpException({ message: "CLA sign flow is not configured" }, 503);

    const body = asRecord(payload);
    if (!body || typeof body.github_username !== "string" || !body.github_username) {
      throw new HttpException({ message: "Missing required data in payload" }, 400);
    }
    const login = body.github_username;

    const pending = await store.getPendingSigner(login);
    if (!pending) {
      throw new HttpException(
        {
          message:
            `No pending request found for ${login}. Are you signing the CLA with the same ` +
            `GitHub user that created the commits in the Pull Request?`,
        },
        400,
      );
    }

    const signature: ClaSignature = {
      ...Object.fromEntries(
        Object.entries(body).filter(([, v]) => typeof v === "string") as [string, string][],
      ),
      github_username: login,
      received_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
    };
    await store.recordSignature(signature);
    await store.deletePendingSigner(login);

    await this.octokit.issues.addLabels({
      owner: pending.owner,
      repo: pending.repo,
      issue_number: pending.number,
      labels: [CLA_RECHECK_LABEL],
    });

    return { message: "ok" };
  }

  /** OAuth code exchange backing the sign form's GitHub login. */
  async authorize(payload: unknown): Promise<Record<string, unknown>> {
    if (!this.env.CLA_SIGN_CLIENT_ID || !this.env.CLA_SIGN_CLIENT_SECRET) {
      throw new HttpException({ message: "CLA sign flow is not configured" }, 503);
    }

    const body = asRecord(payload);
    if (!body || typeof body.code !== "string" || !body.code) {
      throw new HttpException({ message: "Missing required data in payload" }, 400);
    }

    // Params go in the form body, not the query string — request URLs end up
    // in telemetry (Sentry http spans) and intermediary logs.
    const params = new URLSearchParams({
      code: body.code,
      client_id: this.env.CLA_SIGN_CLIENT_ID,
      client_secret: this.env.CLA_SIGN_CLIENT_SECRET,
    });
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: params,
    });
    const data = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok || "error" in data) {
      throw new HttpException(
        { message: (data.error_description as string) ?? "Could not authorize" },
        400,
      );
    }
    return data;
  }
}
