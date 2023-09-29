import { IssuesLabeledEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const COMMENTS = {
    'cpu': ' - [Start a new issue, choose profiler as the integration](https://github.com/home-assistant/core/issues/new?assignees=&labels=&projects=&template=bug_report.yml&integration_name=profiler&integration_link=https%3A%2F%2Fwww.home-assistant.io%2Fintegrations%2Fprofiler)\n - Include a callgrind file from the [profiler](https://my.home-assistant.io/redirect/config_flow_start/?domain=profiler) `profiler.start` service\n - Include a `py-spy` from <https://community.home-assistant.io/t/instructions-to-install-py-spy-on-haos/480473>. (be sure to zip them up before posting as GitHub mutates svg files)\n - If memory is leaking, include 4 hours of RAW logs (`Settings -> System -> Logs -> Download`) from the [profiler](https://my.home-assistant.io/redirect/config_flow_start/?domain=profiler) `profiler.start_log_objects` service with the default settings'
}

export class LabelComment extends BaseWebhookHandler {
    public allowedEventTypes = [EventType.ISSUES_LABELED];
    public allowedRepositories = [HomeAssistantRepository.CORE];

    async handle(context: WebhookContext<IssuesLabeledEvent>) {
        const comment = COMMENTS[context.payload.label.name]
        if (!comment) {
            return;
        }
        context.scheduleIssueComment({
            handler: 'LabelComment',
            comment: comment,
        });
    }
}
