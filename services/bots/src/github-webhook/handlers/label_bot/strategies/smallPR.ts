import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

const SMALL_PR_THRESHOLD = 30;

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) =>
  parsed.reduce(
    (tot, file) => (file.type === 'test' || file.type === null ? tot : tot + file.additions),
    0,
  ) < SMALL_PR_THRESHOLD
    ? ['small-pr']
    : [];
