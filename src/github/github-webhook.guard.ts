import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  type RawBodyRequest,
  UnauthorizedException,
} from "@nestjs/common";
import { verify } from "@octokit/webhooks-methods";
import type { Request } from "express";
import { ENV, type Env } from "../env.js";

/**
 * Verifies the webhook HMAC against the raw request bytes — the parsed body
 * can't be re-serialized byte-identically, hence `rawBody: true` on the app.
 */
@Injectable()
export class GithubWebhookGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const header = request.headers["x-hub-signature-256"];
    const signature = Array.isArray(header) ? (header[0] ?? "") : (header ?? "");
    const body = request.rawBody?.toString() ?? "";

    // raise a 401 if the signature is missing
    if (!signature || !body) {
      throw new UnauthorizedException("Invalid signature");
    }
    if (!(await verify(this.env.GITHUB_WEBHOOK_SECRET, body, signature))) {
      throw new UnauthorizedException("Invalid signature");
    }
    return true;
  }
}
