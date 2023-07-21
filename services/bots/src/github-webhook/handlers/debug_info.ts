import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const COMMENTS = {
    'cpu': ' - Start a new issue, choose profiler as the integration\n - Include a callgrind file from the <https://www.home-assistant.io/integrations/profiler/> `profiler.start` service\n - Include a `py-spy` from <https://community.home-assistant.io/t/instructions-to-install-py-spy-on-haos/480473>. (be sure to zip them up before posting as GitHub mutates svg files)\n - If memory is leaking, include 4 hours of RAW logs (`Settings -> System -> Logs -> Download`) from the <https://www.home-assistant.io/integrations/profiler/> `profiler.start_log_objects` service with the default settings'
}

export class DebugInfo extends BaseWebhookHandler {
    public allowedEventTypes = [EventType.ISSUES_LABELED];
    public allowedRepositories = [HomeAssistantRepository.CORE];

    async handle(context: WebhookContext<IssuesLabeledEvent>) {
        if (!context.payload.label && Object.values(COMMENTS).indexOf(context.payload.label) > -1) {
            return;
        }
        context.scheduleIssueComment({
            handler: 'DebugInfo',
            comment: COMMENTS[context.payload.label],
        });
    }
}
