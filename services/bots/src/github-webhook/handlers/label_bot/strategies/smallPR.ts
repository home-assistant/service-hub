import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

export const SMALL_PR_THRESHOLD = 30;

export const isSmallPR = (parsed: ParsedPath[]): boolean =>
  parsed.reduce(
    (tot, file) => (file.type === 'test' || file.type === null ? tot : tot + file.additions),
    0,
  ) < SMALL_PR_THRESHOLD;

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) =>
  isSmallPR(parsed) ? ['small-pr'] : [];
