import type { Octokit } from "@octokit/rest";

export interface CommandContext {
  github: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
  /** Whether the comment thread belongs to a PR (true) or a plain issue. */
  isPullRequest: boolean;
  commentId: number;
  commentBody: string;
  senderLogin: string;
  botSlug: string;
}

export interface Command {
  name: string;
  handle(context: CommandContext): Promise<void>;
}
