import { EventType } from "../github/engine/event.js";
import type { RuleContext } from "../github/engine/model/rule-context.js";
import { type CheckOutcome, check } from "../github/engine/rule.js";
import type { Effect, Rule } from "../github/engine/types.js";
import { type ClaStore, dynamoClaStore } from "./store.js";

export const CLA_SIGNED_LABEL = "cla-signed";
export const CLA_NEEDED_LABEL = "cla-needed";
export const CLA_ERROR_LABEL = "cla-error";
export const CLA_RECHECK_LABEL = "cla-recheck";

// Bot accounts that are not masked as bots.
const IGNORED_AUTHOR_EMAILS = new Set([
  "travis@travis-ci.org",
  "ImgBotHelp@gmail.com",
  "support@lokalise.com",
  "github-action@users.noreply.github.com",
  "cursoragent@cursor.com",
  "noreply@anthropic.com",
]);

// Repositories that do not contain code.
const IGNORED_REPOSITORIES = new Set([
  "home-assistant/.github",
  "home-assistant/1password-teams-open-source",
  "home-assistant/architecture",
  "home-assistant/assets",
  "home-assistant/brands",
  "home-assistant/bthome.io",
  "home-assistant/buildroot",
  "home-assistant/companion.home-assistant",
  "home-assistant/data.home-assistant",
  "home-assistant/developers.home-assistant",
  "home-assistant/home-assistant.io",
  "home-assistant/organization",
  "home-assistant/partner.home-assistant",
  "home-assistant/people",
  "home-assistant/version",
  "home-assistant/webawesome",
]);

const MAX_LISTED_COMMITS = 10;

const LINK_ACCOUNT_HELP =
  "https://help.github.com/articles/setting-your-email-in-git/#commits-on-github-arent-linking-to-my-account";

type HandledEvent =
  | EventType.PULL_REQUEST_OPENED
  | EventType.PULL_REQUEST_REOPENED
  | EventType.PULL_REQUEST_SYNCHRONIZE
  | EventType.PULL_REQUEST_LABELED
  | EventType.ON_DEMAND;

function signLink(ctx: RuleContext<HandledEvent>): string {
  // Query format the sign form expects, kept verbatim from the legacy bot.
  return `https://home-assistant.io/developers/cla_sign_start/?pr=${ctx.repo.fullName}#${ctx.number}`;
}

/**
 * The CLA check. Every human commit author must have a signature on file;
 * commits not linked to a GitHub account can't be checked at all and fail
 * with instructions. Unsigned authors are recorded as pending signers so the
 * /cla-sign endpoint can find this PR when they sign — signing adds the
 * `cla-recheck` label, whose labeled event re-runs this check.
 */
export function claCheck(getStore: (env: RuleContext["env"]) => ClaStore | undefined): Rule {
  async function evaluate(ctx: RuleContext<HandledEvent>): Promise<CheckOutcome | undefined> {
    if (IGNORED_REPOSITORIES.has(ctx.repo.fullName)) return;

    const store = getStore(ctx.env);
    if (!store) return;

    const effects: Effect[] = [];
    if ("label" in ctx.event) {
      if (ctx.event.label !== CLA_RECHECK_LABEL) return;
      effects.push({ type: "removeLabels", labels: [CLA_RECHECK_LABEL] });
    }

    const commits = await ctx.target.commits();
    const relevant = commits.filter(
      (c) => c.author?.type !== "Bot" && !IGNORED_AUTHOR_EMAILS.has(c.commit?.author?.email ?? ""),
    );

    const unlinked = relevant.filter((c) => !c.author?.login);
    if (unlinked.length > 0) {
      const commitsUrl = `https://github.com/${ctx.repo.fullName}/pull/${ctx.number}/commits/`;
      const lines = unlinked.slice(0, MAX_LISTED_COMMITS).map((c) => {
        const hint = c.commit?.author?.email?.includes("@")
          ? `authored as \`${c.commit.author.email}\` — [link that address to your account](${LINK_ACCOUNT_HELP})`
          : "no email attached — amend the commit with `git commit --amend --author=...`";
        return `- [\`${c.sha.slice(0, 7)}\`](${commitsUrl}${c.sha}) — ${hint}`;
      });
      const extra =
        unlinked.length > MAX_LISTED_COMMITS
          ? `\n…and ${unlinked.length - MAX_LISTED_COMMITS} more`
          : "";
      return {
        status: "fail",
        message:
          `Signature status can't be verified: ${unlinked.length} commit(s) aren't linked ` +
          `to a GitHub account:\n${lines.join("\n")}${extra}`,
        effects: [
          ...effects,
          { type: "addLabels", labels: [CLA_ERROR_LABEL] },
          { type: "removeLabels", labels: [CLA_SIGNED_LABEL] },
        ],
      };
    }

    const shasByLogin = new Map<string, string[]>();
    for (const c of relevant) {
      const login = c.author?.login;
      if (!login) continue;
      shasByLogin.set(login, [...(shasByLogin.get(login) ?? []), c.sha]);
    }

    const unsigned: string[] = [];
    for (const login of shasByLogin.keys()) {
      if (!(await store.hasSigned(login))) unsigned.push(login);
    }

    if (unsigned.length > 0) {
      await store.recordPendingSigners(
        unsigned.map((login) => ({
          login,
          // biome-ignore lint/style/noNonNullAssertion: keys come from the map
          shas: shasByLogin.get(login)!,
          pr: { owner: ctx.repo.owner, repo: ctx.repo.name, number: ctx.number },
        })),
      );
      const who = unsigned.map((login) => `@${login}`).join(", ");
      return {
        status: "fail",
        message:
          `${who} — please [sign our Contributor License Agreement](${signLink(ctx)}). ` +
          `We can review and accept this pull request once every commit author has signed.`,
        effects: [
          ...effects,
          { type: "addLabels", labels: [CLA_NEEDED_LABEL] },
          { type: "removeLabels", labels: [CLA_SIGNED_LABEL] },
        ],
      };
    }

    const allIgnored = relevant.length === 0;
    if (!allIgnored) {
      effects.push({ type: "addLabels", labels: [CLA_SIGNED_LABEL] });
    }
    effects.push({ type: "removeLabels", labels: [CLA_NEEDED_LABEL, CLA_ERROR_LABEL] });
    return {
      status: "pass",
      message: allIgnored
        ? "All commit authors are bots — nothing to sign."
        : "Everyone involved has signed the CLA.",
      effects,
    };
  }

  return check({
    id: "cla",
    title: "CLA",
    description: "Requires every commit author to have signed the Contributor License Agreement.",
    events: [
      EventType.PULL_REQUEST_OPENED,
      EventType.PULL_REQUEST_REOPENED,
      EventType.PULL_REQUEST_SYNCHRONIZE,
      EventType.PULL_REQUEST_LABELED,
      EventType.ON_DEMAND,
    ],
    evaluate,
  });
}

/** The production rule, reading and writing the DynamoDB-backed store. */
export const cla: Rule = claCheck(dynamoClaStore);
