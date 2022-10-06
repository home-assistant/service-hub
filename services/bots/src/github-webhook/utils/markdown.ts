interface Task {
  checked: boolean;
  description: string;
}

export interface MarkdownSection {
  title?: string;
  text?: string;
  tasks: Task[];
  urls: URL[];
}

interface MarkdownParserOptions {
  ignoreComments?: boolean;
}

const reUrl =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/;
const reTask = /^-\s?\[\s?(?<checked>\w| |)\s?\] (?<description>.*)/;

export const markdownParser = (
  markdown: string,
  options?: MarkdownParserOptions,
): MarkdownSection[] =>
  markdown
    ?.split('\n#')
    .map((rawSection) => {
      const splitSections = rawSection.split('\n');
      const section: MarkdownSection = {
        title: markdown.includes('#') ? splitSections[0].replace(/#/g, '').trim() : undefined,
        urls: [],
        tasks: [],
      };
      const rawText: string[] = [];
      let comment: boolean = false;
      for (const line of splitSections.slice(markdown.includes('#') ? 1 : 0)) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (options?.ignoreComments) {
          if (!comment && trimmedLine.startsWith('<!--')) comment = true;

          if (comment) {
            if (trimmedLine.endsWith('-->')) comment = false;
            continue;
          }
        }

        const matchUrl = reUrl.exec(trimmedLine);
        const matchTask = reTask.exec(trimmedLine);

        if (matchUrl) {
          section.urls.push(new URL(matchUrl[0]));
        } else if (matchTask?.groups) {
          section.tasks.push({
            checked: Boolean(matchTask.groups.checked),
            description: matchTask.groups.description,
          });
        } else {
          rawText.push(trimmedLine);
        }
      }

      if (rawText.length) section.text = rawText.join('\n');

      return section;
    })
    .filter((section) => Object.keys(section).find((key) => section[key]?.length));
