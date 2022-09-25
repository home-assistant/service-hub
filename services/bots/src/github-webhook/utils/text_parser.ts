interface IntegrationDocumentationLink {
  link: string;
  integration: string;
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
): IntegrationDocumentationLink[] => {
  const re = /https:\/\/(www.|rc.|next.|)home-assistant.io\/integrations\/(?:\w+\.)?(\w+)/g;
  let match;
  let results: IntegrationDocumentationLink[] = [];

  do {
    match = re.exec(body);
    if (match) {
      results.push({ link: match[0], integration: match[2] });
    }
  } while (match);

  return results;
};

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
