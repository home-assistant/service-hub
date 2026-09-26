import { PullRequest, PullRequestLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

// Guidance comments posted when a pull request receives one of these labels.
const PR_CONTEXT: Record<string, string> = {
  'new-integration': `Thanks for the contribution! While this waits for review, it may help to self-check a few things reviewers will look at:

- **Docs**: does it follow the [development checklist](https://developers.home-assistant.io/docs/development_checklist/)? In particular, all device/API communication should live in a [separate library on PyPI](https://developers.home-assistant.io/docs/creating_component_code_review) referenced in the manifest, not inside the integration.
- **Quality scale**: since this targets Bronze, going through the [quality-scale rules](https://developers.home-assistant.io/docs/integration_quality_scale_index/) and ticking them off in \`quality_scale.yaml\` avoids surprises later.
- **Scope**: a new integration should add a single platform to keep the PR small and reviewable — further platforms can follow in separate PRs.`,
};

export class PrContext extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  /**
   * When a pull request gets a label we have guidance for, leave that guidance
   * as a comment — e.g. pointing new-integration authors at the docs, quality
   * scale and single-platform guideline while their PR waits for review.
   */
  async handle(context: WebhookContext<PullRequestLabeledEvent>) {
    const labelName = context.payload.label?.name;
    const message = labelName ? PR_CONTEXT[labelName] : undefined;
    if (!message) {
      return;
    }

    const author = (context.payload.pull_request as PullRequest).user.login;

    context.scheduleIssueComment({
      handler: 'PrContext',
      comment: `@${author} ${message}`,
    });
  }
}
