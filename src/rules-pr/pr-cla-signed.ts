import type { WebhookContext } from "../context/webhook-context.js";
import { EventType } from "../github/types.js";
import type { Rule, RuleResult } from "../rules/types.js";

const CLA_LABEL_SIGNED = "cla-signed";
const CLA_LABEL_NEEDED = "cla-needed";
const CLA_LABEL_RECHECK = "cla-recheck";
const CLA_CONTEXT = "cla-bot";

const ignoredAuthors = new Set([
  "travis@travis-ci.org",
  "ImgBotHelp@gmail.com",
  "support@lokalise.com",
  "github-action@users.noreply.github.com",
  "cursoragent@cursor.com",
  "noreply@anthropic.com",
]);

const ignoredRepositories = new Set([
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

interface Commit {
  sha: string;
  author: { login?: string; type?: string } | null;
  commit: { author: { email?: string } | null };
}

export const prClaSigned: Rule = {
  name: "validate-cla",
  listens: [
    EventType.PULL_REQUEST_OPENED,
    EventType.PULL_REQUEST_REOPENED,
    EventType.PULL_REQUEST_SYNCHRONIZE,
    EventType.PULL_REQUEST_LABELED,
  ],

  async handle(context: WebhookContext): Promise<RuleResult | undefined> {
    if (ignoredRepositories.has(context.repository)) return;

    const payload = context.payload as unknown as {
      action: string;
      label?: { name: string };
      number: number;
      pull_request: { user: { login: string }; head: { sha: string } };
      repository: { full_name: string; owner: { login: string }; name: string };
    };

    // Only process labeled events if it's a cla-recheck
    if (payload.action === "labeled") {
      if (payload.label?.name !== CLA_LABEL_RECHECK) return;
      // Remove the recheck label
      return {
        removeLabels: [CLA_LABEL_RECHECK],
        actions: [async (ctx) => runClaCheck(ctx, payload)],
      };
    }

    return { actions: [async (ctx) => runClaCheck(ctx, payload)] };
  },
};

async function runClaCheck(
  context: WebhookContext,
  payload: {
    number: number;
    pull_request: { user: { login: string }; head: { sha: string } };
    repository: { full_name: string; owner: { login: string }; name: string };
  },
): Promise<void> {
  const signedAuthors = new Set<string>();
  const authorsNeedingCLA: { sha: string; login: string }[] = [];
  const commitsWithoutLogins: { sha: string; maybeText: string }[] = [];

  const commits: Commit[] = await context.github.paginate(
    context.github.pulls.listCommits,
    context.pullRequest({ per_page: 100 }),
  );

  const allCommitsIgnored = commits.every(
    (commit) =>
      commit.author?.type === "Bot" || ignoredAuthors.has(commit.commit?.author?.email ?? ""),
  );

  for (const commit of commits) {
    if (commit.author?.type === "Bot" || ignoredAuthors.has(commit.commit?.author?.email ?? "")) {
      continue;
    }

    if (!commit.author?.login) {
      const email = commit.commit?.author?.email ?? "";
      commitsWithoutLogins.push({
        sha: commit.sha,
        maybeText: email.includes("@")
          ? `This commit has something that looks like an email address (${email}). Maybe try linking that to GitHub?.`
          : "No email found attached to the commit.",
      });
    } else if (!signedAuthors.has(commit.author.login)) {
      const row = await context.db.queryOne<{ github_username: string }>(
        "SELECT github_username FROM cla_signers WHERE github_username = ?",
        commit.author.login,
      );

      if (row) {
        signedAuthors.add(commit.author.login);
      } else {
        authorsNeedingCLA.push({ login: commit.author.login, sha: commit.sha });
      }
    }
  }

  if (commitsWithoutLogins.length) {
    const commitUrl = `https://github.com/${payload.repository.full_name}/pull/${payload.number}/commits/`;
    await context.github.pulls.createReview(
      context.pullRequest({
        body: noLoginComment(commitsWithoutLogins, payload.pull_request.user.login, commitUrl),
        event: "REQUEST_CHANGES" as const,
      }),
    );
    await context.github.issues.addLabels(context.issue({ labels: ["cla-error"] }));

    for (const commit of commitsWithoutLogins) {
      await context.github.repos.createCommitStatus(
        context.repo({
          sha: commit.sha,
          state: "failure" as const,
          description: "Commit(s) are missing a linked GitHub user.",
          context: CLA_CONTEXT,
        }),
      );
    }
    return;
  }

  if (authorsNeedingCLA.length) {
    const prRef = `${payload.repository.full_name}#${payload.number}`;
    const users = [...new Set(authorsNeedingCLA.map((e) => `@${e.login}`))];

    await context.github.pulls.createReview(
      context.pullRequest({
        body: claNeededComment(users, prRef),
        event: "REQUEST_CHANGES" as const,
      }),
    );
    await context.github.issues.addLabels(context.issue({ labels: [CLA_LABEL_NEEDED] }));

    for (const entry of authorsNeedingCLA) {
      await context.github.repos.createCommitStatus(
        context.repo({
          sha: entry.sha,
          state: "failure" as const,
          description: "At least one contributor needs to sign the CLA",
          context: CLA_CONTEXT,
        }),
      );
    }

    // Record pending signers in DB
    const grouped: Record<string, string[]> = {};
    for (const entry of authorsNeedingCLA) {
      if (!grouped[entry.login]) {
        grouped[entry.login] = [];
      }
      grouped[entry.login].push(entry.sha);
    }

    for (const [author, shas] of Object.entries(grouped)) {
      await context.db.execute(
        `INSERT OR REPLACE INTO cla_pending_signers
         (github_username, commits, pr, repository_owner, repository, pr_number)
         VALUES (?, ?, ?, ?, ?, ?)`,
        author,
        JSON.stringify(shas),
        `${payload.repository.full_name}#${payload.number}`,
        payload.repository.owner.login,
        payload.repository.name,
        String(payload.number),
      );
    }
    return;
  }

  // All good — everyone has signed
  if (!allCommitsIgnored) {
    await context.github.issues.addLabels(context.issue({ labels: [CLA_LABEL_SIGNED] }));
  }

  try {
    await context.github.issues.removeLabel(context.issue({ name: CLA_LABEL_NEEDED }));
  } catch {
    // label may not exist
  }

  for (const commit of commits) {
    await context.github.repos.createCommitStatus(
      context.repo({
        sha: commit.sha,
        state: "success" as const,
        description: allCommitsIgnored
          ? "Everyone involved are ignored"
          : "Everyone has signed the CLA",
        context: CLA_CONTEXT,
      }),
    );
  }
}

const noLoginComment = (
  commits: { sha: string; maybeText: string }[],
  prAuthor: string,
  urlPrefix: string,
) => `Hello @${prAuthor},

When attempting to inspect the commits of your pull request for CLA signature status among all authors we encountered commit(s) which were not linked to a GitHub account, thus not allowing us to determine their status(es).

The commits that are missing a linked GitHub account are the following:

${commits.map((c) => `- [\`${c.sha}\`](${urlPrefix}${c.sha}) - ${c.maybeText}`).join("\n")}

Unfortunately, **we are unable to accept this pull request until this situation is corrected.**

Here are your options:

1. If you had an email address set for the commit that simply wasn't linked to your GitHub account you can link that email now and it will retroactively apply to your commits. The simplest way to do this is to click the link to one of the above commits and look for a blue question mark in a blue circle in the top left. Hovering over that bubble will show you what email address you used. Clicking on that button will take you to your email address settings on GitHub. Just add the email address on that page and you're all set. GitHub has more information about this option [in their help center](https://help.github.com/articles/setting-your-email-in-git/#commits-on-github-arent-linking-to-my-account).

2. If you didn't use an email address at all, it was an invalid email, or it's one you can't link to your GitHub, you will need to change the authorship information of the commit and your global Git settings so this doesn't happen again going forward. GitHub provides some great instructions on how to change your authorship information [in their help center](https://help.github.com/articles/setting-your-email-in-git/).`;

const claNeededComment = (users: string[], pullRequest: string) => `Hi ${users.join(", ")}

It seems you haven't yet signed a CLA. Please do so [here](https://home-assistant.io/developers/cla_sign_start/?pr=${pullRequest}).

Once you do that we will be able to review and accept this pull request.

Thanks!`;
