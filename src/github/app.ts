import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  installationId: string;
}

export function createOctokit(config: GitHubAppConfig): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: Number(config.appId),
      installationId: Number(config.installationId),
      privateKey: config.privateKey,
    },
  });
}
