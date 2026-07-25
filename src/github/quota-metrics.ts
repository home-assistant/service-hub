import type { Octokit } from "@octokit/rest";
import * as Sentry from "@sentry/node";

type Headers = Record<string, string | number | undefined>;

// GitHub returns per-resource rate-limit headers on every response (and on
// 403/429 rejections), so this is ground-truth quota rather than an estimate.
function recordQuota(headers: Headers): void {
  const remaining = Number(headers["x-ratelimit-remaining"]);
  const resource = headers["x-ratelimit-resource"];
  if (Number.isNaN(remaining) || resource === undefined) return;
  const attributes = { resource: String(resource) };
  Sentry.metrics.gauge("github.ratelimit.remaining", remaining, { attributes });
  Sentry.metrics.gauge("github.ratelimit.limit", Number(headers["x-ratelimit-limit"]), {
    attributes,
  });
  Sentry.metrics.count("github.api.calls", 1, { attributes });
}

// Instrument the one shared client so quota burn is visible per resource
// (core / search / graphql) against the installation's rate-limit ceiling.
export function trackGithubQuota(octokit: Octokit): void {
  octokit.hook.wrap("request", async (request, options) => {
    try {
      const response = await request(options);
      recordQuota(response.headers);
      return response;
    } catch (error) {
      if (error && typeof error === "object" && "response" in error) {
        const response = (error as { response?: { headers?: Headers } }).response;
        if (response?.headers) recordQuota(response.headers);
      }
      throw error;
    }
  });
}
