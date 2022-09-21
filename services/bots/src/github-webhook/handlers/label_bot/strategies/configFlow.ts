import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) => {
  const addedFlows = new Set(
    parsed
      .filter(
        (fil) =>
          fil.type == 'component' && fil.status == 'added' && fil.filename === 'config_flow.py',
      )
      .map((fil) => fil.component),
  );
  // remove new integrations
  for (const fil of parsed) {
    if (fil.type == 'component' && fil.status == 'added' && fil.filename === '__init__.py') {
      addedFlows.delete(fil.component);
    }
  }
  return addedFlows.size ? ['config-flow'] : [];
};
