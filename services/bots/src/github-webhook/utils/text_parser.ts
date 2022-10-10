interface IntegrationDocumentationLink {
  link: string;
  integration: string;
  platform?: string;
}

interface Task {
  checked: boolean;
  description: string;
}

interface IssuePullInfo {
  owner: string;
  repo: string;
  number: number;
}

export const extractIntegrationDocumentationLinks = (
  body: string,
): IntegrationDocumentationLink[] =>
  body
    .split('\n')
    .map(
      (line) =>
        /(?<link>https:\/\/(?<subdomain>www|rc|next).?home-assistant.io\/integrations\/(?<integration>\w+)\.?(?<platform>\w+)?)/g.exec(
          line,
        )?.groups,
    )
    .filter((groups) => groups !== undefined)
    .map((groups) => ({
      link: groups.link,
      integration: groups.integration,
      platform: groups.platform,
    }));

export const extractForumLinks = (body: string): string[] =>
  body
    .split('\n')
    .map(
      (line) =>
        /.*(?<link>https:\/\/community.home-assistant.io\/t\/.*\/\d+)(\s|\n|)/.exec(line)?.groups,
    )
    .filter((groups) => groups !== undefined)
    .map((groups) => groups.link);

export const extractTasks = (body: string): Task[] =>
  body
    .split('\n')
    .map((line) => /^-\s?\[\s?(?<checked>\w| |)\s?\] (?<description>.*)/.exec(line.trim())?.groups)
    .filter((groups) => groups !== undefined)
    .map((groups) => ({
      checked: Boolean(groups.checked),
      description: groups.description,
    }));

export const extractDocumentationSectionsLinks = (body: string): string[] => {
  const re = /https:\/\/(www.|rc.|next.|)home-assistant.io\/(.*)\//g;
  let match;
  let results: string[] = [];

  do {
    match = re.exec(body);
    if (match) {
      const sections = match[2].split('/');
      results = results.concat(sections);
    }
  } while (match);

  return [...new Set(results)];
};

export const extractIssuesOrPullRequestMarkdownLinks = (body: string) => {
  const re = /([\w-\.]+)\/([\w-\.]+)#(\d+)/g;
  let match;
  const results: IssuePullInfo[] = [];

  do {
    match = re.exec(body);
    if (match) {
      results.push({ owner: match[1], repo: match[2], number: Number(match[3]) });
    }
  } while (match);

  return results;
};

export const extractPullRequestURLLinks = (body: string) => {
  const re = /https:\/\/github.com\/([\w-\.]+)\/([\w-\.]+)\/pull\/(\d+)/g;
  let match;
  const results: IssuePullInfo[] = [];

  do {
    match = re.exec(body);
    if (match) {
      results.push({ owner: match[1], repo: match[2], number: Number(match[3]) });
    }
  } while (match);

  return results;
};
