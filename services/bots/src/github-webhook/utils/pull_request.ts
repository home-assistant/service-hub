import { ListPullRequestFiles } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';

export const fetchPullRequestFilesFromContext = async (
  context: WebhookContext<any>,
): Promise<ListPullRequestFiles> => {
  if (!context._prFilesCache) {
    context._prFilesCache = (await context.github.pulls.listFiles(context.issue())).data;
  }
  return context._prFilesCache;
};
