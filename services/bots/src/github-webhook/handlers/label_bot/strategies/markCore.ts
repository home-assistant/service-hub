import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) =>
  parsed.some((file) => file.core) ? ['core'] : [];
