import { ListPullRequestFiles } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';

export const fetchPullRequestFilesFromContext = async (
  context: WebhookContext<any>,
): Promise<ListPullRequestFiles> => {
  if (!context._prFiles) {
    context._prFiles = (await context.github.pulls.listFiles(context.issue())).data;
  }
  return context._prFiles;
};
