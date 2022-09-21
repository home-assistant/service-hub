import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) =>
  parsed.some(
    (fil) => fil.type == 'component' && fil.status == 'added' && fil.filename === '__init__.py',
  )
    ? ['new-integration']
    : parsed.some((fil) => fil.type == 'platform' && fil.status == 'added')
    ? ['new-platform']
    : [];
