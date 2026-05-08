import type { Octokit } from "@octokit/rest";
import type { Database } from "../db/types.js";

export interface CommandContext {
  github: Octokit;
  db: Database;
  owner: string;
  repo: string;
  issueNumber: number;
  commentId: number;
  commentBody: string;
  senderLogin: string;
}

export interface Command {
  name: string;
  pattern: RegExp;
  handle(context: CommandContext): Promise<void>;
}
