import type { Provider } from "@nestjs/common";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { ENV, type Env } from "../env.js";
import { trackGithubQuota } from "./quota-metrics.js";

/** Injection token for the app-authenticated, quota-tracked Octokit client. */
export const OCTOKIT = Symbol("OCTOKIT");

export const octokitProvider: Provider = {
  provide: OCTOKIT,
  useFactory: (env: Env): Octokit => {
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(env.GITHUB_APP_ID),
        installationId: Number(env.GITHUB_INSTALLATION_ID),
        privateKey: env.GITHUB_PRIVATE_KEY,
      },
    });
    trackGithubQuota(octokit);
    return octokit;
  },
  inject: [ENV],
};
