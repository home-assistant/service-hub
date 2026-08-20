import { PullRequest, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const TEMPLATE_PATH = '.github/PULL_REQUEST_TEMPLATE.md';
const TEMPLATE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// The template is near-static, so cache it per repository+ref across events
// (the service is long-lived). Only successful reads are cached; failures fall
// through so a transient error does not suppress the check for the whole TTL.
const templateCache = new Map<string, { content: string; expires: number }>();

/** Test seam: drop the cached templates so specs stay isolated. */
export const resetTemplateCache = (): void => templateCache.clear();

// Up to three leading spaces are allowed before an ATX heading; GitHub still
// renders those as headings.
const HEADING_LINE = /^ {0,3}#{1,6}\s+(.*\S)/;
const TASK_LINE = /^\s*-\s?\[[ xX]?\]\s+(.*\S)\s*$/;

/**
 * Run a callback over the lines of a markdown document, skipping HTML comment
 * blocks (`<!-- … -->`). Used to read headers and checkboxes the same way.
 */
const forEachContentLine = (markdown: string, visit: (line: string) => void): void => {
  let inComment = false;
  for (const line of markdown.split('\n')) {
    if (!inComment && line.includes('<!--')) {
      inComment = !line.includes('-->');
      continue;
    }
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    visit(line);
  }
};

/** Collect the normalized `##` section headers of a markdown document. */
const sectionHeaders = (markdown: string): Set<string> => {
  const headers = new Set<string>();
  forEachContentLine(markdown, (line) => {
    const match = line.match(HEADING_LINE);
    if (match) headers.add(match[1].replace(/\s+/g, ' ').trim().toLowerCase());
  });
  return headers;
};

// Normalize a checkbox item for matching: strip markdown links, code and
// emphasis markers (so the same item matches whatever formatting the body
// uses), collapse whitespace and drop trailing punctuation.
const normalizeItem = (text: string): string =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // inline links [text](url) -> text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1') // reference links [text][ref] -> text
    .replace(/[`*_]/g, '') // code / bold / italic markers
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:]$/, '')
    .toLowerCase();

/**
 * Every checkbox the template expects to be kept: all `- [ ]` items except the
 * conditional ones (those under an "If …:" / "To …:" intro, which may be
 * dropped when they don't apply). The template says to tick the applicable
 * boxes rather than delete any, so all of these should be present. Derived from
 * the live template, so it tracks the template automatically. Returns the
 * original item text plus a normalized signature.
 */
const requiredCheckboxes = (templateMd: string): { text: string; sig: string }[] => {
  const items: { text: string; sig: string }[] = [];
  let conditional = false;

  forEachContentLine(templateMd, (line) => {
    if (HEADING_LINE.test(line)) {
      conditional = false; // a new section resets the conditional scope
      return;
    }
    const task = line.match(TASK_LINE);
    if (task) {
      if (!conditional) items.push({ text: task[1].trim(), sig: normalizeItem(task[1]) });
      return;
    }
    if (line.trim() === '') return;
    // A prose line ending in ":" introduces a conditional block ("If …:").
    if (line.trim().endsWith(':')) conditional = true;
  });

  return items;
};

/** Normalized checkbox items present in a PR description. */
const bodyTaskItems = (bodyMd: string): string[] => {
  const items: string[] = [];
  forEachContentLine(bodyMd, (line) => {
    const task = line.match(TASK_LINE);
    if (task) items.push(normalizeItem(task[1]));
  });
  return items;
};

export class PrTemplate extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  /**
   * Fetch the base-branch template, cached per repo+ref (the service is
   * long-lived). Returns null — meaning "do nothing" — when the template can't
   * be read or has no parseable headers. Only usable templates are cached, so a
   * transient bad read is retried on the next PR rather than poisoning the cache.
   */
  private async fetchTemplate(
    context: WebhookContext<PullRequestOpenedEvent>,
    ref: string,
  ): Promise<string | null> {
    const cacheKey = `${context.repository}@${ref}`;
    const cached = templateCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.content;
    }

    let content: string;
    try {
      const response = await context.github.repos.getContent(
        context.repo({ path: TEMPLATE_PATH, ref }),
      );
      // @ts-ignore - getContent returns a union; a file response has `content`
      content = Buffer.from(response.data.content, 'base64').toString();
    } catch {
      return null;
    }

    if (sectionHeaders(content).size === 0) {
      return null;
    }

    templateCache.set(cacheKey, { content, expires: Date.now() + TEMPLATE_CACHE_TTL_MS });
    return content;
  }

  /**
   * When a pull request is opened, check whether its description follows the
   * repository pull request template. Two checks, in order:
   *
   *  1. If the description shares no `##` section header with the template, it
   *     was replaced wholesale — comment asking to use the template.
   *  2. Otherwise, if any of the template's non-conditional checkboxes were
   *     removed — comment listing the missing ones.
   *
   * Both checks are deliberately conservative and fail open.
   */
  async handle(context: WebhookContext<PullRequestOpenedEvent>) {
    const pullRequest = context.payload.pull_request as PullRequest;

    const templateContent = await this.fetchTemplate(context, pullRequest.base.ref);
    if (templateContent === null) {
      return;
    }

    const body = pullRequest.body || '';
    const author = pullRequest.user.login;
    const templateUrl = `https://github.com/${context.repository}/blob/${pullRequest.base.ref}/${TEMPLATE_PATH}`;

    // (1) Did the description use the template at all? (a shared section header)
    const templateHeaders = sectionHeaders(templateContent);
    const usesTemplate = [...sectionHeaders(body)].some((header) => templateHeaders.has(header));

    if (!usesTemplate) {
      // The description shares no section with the template: it was replaced
      // wholesale. Ask the author to use the template.
      context.scheduleIssueComment({
        handler: 'PrTemplate',
        comment: `Hi @${author}, thanks for the contribution!

It looks like the description of this pull request doesn't follow our [pull request template](${templateUrl}). The template captures the type of change, any breaking-change notes and the checklist reviewers rely on, so filling it in helps get your PR reviewed faster.

Could you update the description above to use the template? You can edit it at any time. Thanks!`,
      });
      return;
    }

    // (2) Were any of the template's checkboxes deleted? (tick, don't remove.)
    // Match with startsWith so an item the author annotated still counts.
    const items = bodyTaskItems(body);
    const missing = requiredCheckboxes(templateContent).filter(
      (item) => !items.some((present) => present.startsWith(item.sig)),
    );
    if (missing.length === 0) {
      return;
    }

    context.scheduleIssueComment({
      handler: 'PrTemplate',
      comment: `Hi @${author}, thanks for the contribution!

Some checkboxes from the [pull request template](${templateUrl}) appear to be missing from the description. The template asks you to keep them all and tick the ones that apply, rather than deleting lines. Missing:

${missing.map((item) => `- [ ] ${item.text}`).join('\n')}

Could you add them back? Thanks!`,
    });
  }
}
