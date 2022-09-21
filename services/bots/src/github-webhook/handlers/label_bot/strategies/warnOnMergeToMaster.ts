import { PullRequest, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) =>
  (context.payload.pull_request as PullRequest).base.ref === 'master'
    ? ['merging-to-master']
    : (context.payload.pull_request as PullRequest).base.ref === 'rc'
    ? ['merging-to-rc']
    : [];
