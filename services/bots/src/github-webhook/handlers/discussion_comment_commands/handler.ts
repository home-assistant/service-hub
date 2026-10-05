import { DiscussionCommentCreatedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../../github-webhook.const';
import { WebhookContext } from '../../github-webhook.model';
import { addDiscussionCommentReaction } from '../../utils/discussion';
import { fetchIntegrationManifest } from '../../utils/integration';
import { BaseWebhookHandler } from '../base';
import { DiscussionCommentCommandBase } from './commands/base';

import { AnswerDiscussionCommentCommand } from './commands/answer';
import { CloseDiscussionCommentCommand } from './commands/close';
import { RenameDiscussionCommentCommand } from './commands/rename';
import { ReopenDiscussionCommentCommand } from './commands/reopen';

const COMMAND_REGEX: RegExp =
  /^(?<tagged>@home-assistant)\s(?<command>[\w|-]*)(\s(?<additional>.*))?$/;

export const DISCUSSION_COMMENT_COMMANDS: DiscussionCommentCommandBase[] = [
  new CloseDiscussionCommentCommand(),
  new ReopenDiscussionCommentCommand(),
  new AnswerDiscussionCommentCommand(),
  new RenameDiscussionCommentCommand(),
];

export class DiscussionCommentCommands extends BaseWebhookHandler {
  public allowBots = false;
  public allowedEventTypes = [EventType.DISCUSSION_COMMENT_CREATED];
  public allowedRepositories = [HomeAssistantRepository.FEATURE_REQUESTS];

  async handle(context: WebhookContext<DiscussionCommentCreatedEvent>) {
    const input = COMMAND_REGEX.exec(context.payload.comment.body || '')?.groups;

    if (!input) {
      return;
    }

    const commentId = context.payload.comment.node_id;
    const command = DISCUSSION_COMMENT_COMMANDS.find(
      (command) => command.command === input.command,
    );
    if (!command || (command.requireAdditional && !input.additional)) {
      await addDiscussionCommentReaction(context, commentId, false);
      return;
    }

    // The webhook payload carries the discussion's labels, but the base
    // `Discussion` type does not declare them.
    const discussionLabels =
      (context.payload.discussion as { labels?: { name: string }[] }).labels || [];
    const currentLabels = discussionLabels.map((label) => label.name);
    const currentIntegrationFromLabels = currentLabels
      .filter((label) => label.startsWith('integration: '))
      .map((label) => label.split('integration: ')[1]);

    const integrationManifests = {};
    for (const integration of currentIntegrationFromLabels) {
      integrationManifests[integration] = await fetchIntegrationManifest(integration);
    }

    try {
      const result = await command.handle(context, {
        invoker: context.payload.comment.user.login,
        additional: input.additional,
        currentLabels,
        integrationManifests,
      });
      await addDiscussionCommentReaction(context, commentId, result);
    } catch (_) {
      await addDiscussionCommentReaction(context, commentId, false);
    }
  }
}
