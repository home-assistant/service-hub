import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { EventType, Repository } from '../../github-webhook.const';
import { WebhookContext } from '../../github-webhook.model';
import { ParsedPath } from '../../utils/parse_path';
import { fetchPullRequestFilesFromContext } from '../../utils/pull_request';
import { BaseWebhookHandler } from '../base';
import componentAndPlatform from './strategies/componentAndPlatform';
import configFlow from './strategies/configFlow';
import hasTests from './strategies/hasTests';
import markCore from './strategies/markCore';
import newIntegrationOrPlatform from './strategies/newIntegrationOrPlatform';
import removePlatform from './strategies/removePlatform';
import smallPR from './strategies/smallPR';
import typeOfChange from './strategies/typeOfChange';
import warnOnMergeToMaster from './strategies/warnOnMergeToMaster';

const STRATEGIES = new Set([
  configFlow,
  hasTests,
  markCore,
  newIntegrationOrPlatform,
  removePlatform,
  smallPR,
  typeOfChange,
  warnOnMergeToMaster,
]);

export class LabelBot extends BaseWebhookHandler {
  public allowBots = false;
  public allowedRepositories = [Repository.CORE];
  public allowedEventTypes = [EventType.PULL_REQUEST_OPENED];

  async handle(context: WebhookContext<PullRequestOpenedEvent>) {
    const files = await fetchPullRequestFilesFromContext(context);
    const parsed = files.map((file) => new ParsedPath(file));
    const labelSet: Set<string> = new Set();

    STRATEGIES.forEach((strategy) => {
      for (const label of strategy(context, parsed)) {
        labelSet.add(label);
      }
    });

    // componentAndPlatform can create many labels, process them separately
    const componentLabelSet = new Set();
    for (const label of componentAndPlatform(context, parsed)) {
      componentLabelSet.add(label);
    }

    if (labelSet.size + componentLabelSet.size <= 9) {
      componentLabelSet.forEach(labelSet.add, labelSet);
    }

    for (const label of labelSet) {
      context.scheduleIssueLabel(label);
    }
  }
}
