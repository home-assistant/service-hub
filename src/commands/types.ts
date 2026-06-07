import type { Octokit } from "@octokit/rest";

export interface CommandContext {
  github: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
  commentId: number;
  commentBody: string;
  senderLogin: string;
  botSlug: string;
}

export interface Command {
  name: string;
  handle(context: CommandContext): Promise<void>;
}
