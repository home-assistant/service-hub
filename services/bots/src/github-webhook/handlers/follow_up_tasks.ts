import { PullRequestClosedEvent } from '@octokit/webhooks-types';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

const FOLLOW_UP_TASKS_CONFIG = {
  repo: 'supervisor',
  projectNumber: 21,
} as const;

const FOLLOW_UP_LABELS = [
  'missing-documentation',
  'needs-cli',
  'needs-core',
  'needs-client-library',
] as const;

type FollowUpLabel = (typeof FOLLOW_UP_LABELS)[number];

type ProjectFieldInfo = {
  id: string;
  name: string;
  options?: { id: string; name: string }[];
};

type FollowUpTasksConfig = typeof FOLLOW_UP_TASKS_CONFIG;

export class FollowUpTasks extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_CLOSED];
  public allowedRepositories = [HomeAssistantRepository.SUPERVISOR];

  private static _issueTypeCache?: {
    taskIssueTypeId?: string;
  };
  private static _projectCache?: {
    projectId: string;
    fields: ProjectFieldInfo[];
  };

  async handle(context: WebhookContext<PullRequestClosedEvent>) {
    const pr = context.payload.pull_request;

    if (!pr.merged) return;
    if (pr.base?.ref !== 'main') return;

    const currentLabels = new Set(pr.labels.map((label) => label.name));
    const matchedLabels = FOLLOW_UP_LABELS.filter((label) => currentLabels.has(label));
    if (!matchedLabels.length) return;

    const cfg = FOLLOW_UP_TASKS_CONFIG;

    const issueTitle = `Follow-up tasks for PR "${pr.title}"`;
    const issueBody = [
      `This issue was automatically created because PR ${pr.html_url} was merged with the following label(s):`,
      '',
      ...matchedLabels.map((label) => `- \`${label}\``),
      '',
      `PR: ${pr.html_url}`,
    ].join('\n');

    const created = await context.github.issues.create(
      context.repo({
        title: issueTitle,
        body: issueBody,
      }),
    );

    await this.trySetIssueTypeTask({
      context,
      config: cfg,
      issueNodeId: created.data.node_id,
    });

    await this.addIssueToProject({
      context,
      config: cfg,
      issueNodeId: created.data.node_id,
    });
  }

  private async trySetIssueTypeTask(params: {
    context: WebhookContext<any>;
    config: FollowUpTasksConfig;
    issueNodeId: string;
  }): Promise<void> {
    const { context, config, issueNodeId } = params;

    try {
      const taskIssueTypeId = await this.getTaskIssueTypeId({ context, config });
      if (!taskIssueTypeId) return;

      await context.github.graphql({
        query: `
          mutation($issueId: ID!, $issueTypeId: ID!) {
            updateIssue(input: { id: $issueId, issueTypeId: $issueTypeId }) {
              issue { id }
            }
          }
        `,
        issueId: issueNodeId,
        issueTypeId: taskIssueTypeId,
      });
    } catch (_err) {
      // ignored intentionally
    }
  }

  private async getTaskIssueTypeId(params: {
    context: WebhookContext<any>;
    config: FollowUpTasksConfig;
  }): Promise<string | undefined> {
    const { context, config } = params;

    if (FollowUpTasks._issueTypeCache?.taskIssueTypeId !== undefined) {
      return FollowUpTasks._issueTypeCache.taskIssueTypeId;
    }

    const result = await context.github.graphql<{
      repository: {
        issueTypes: {
          nodes: Array<{ id: string; name: string }>;
        };
      };
    }>({
      query: `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issueTypes(first: 50) {
              nodes { id name }
            }
          }
        }
      `,
      owner: context.repo().owner,
      repo: config.repo,
    });

    const task = (result.repository.issueTypes.nodes || []).find((t) => t.name === 'Task');
    FollowUpTasks._issueTypeCache = { taskIssueTypeId: task?.id };
    return task?.id;
  }

  private async addIssueToProject(params: {
    context: WebhookContext<any>;
    config: FollowUpTasksConfig;
    issueNodeId: string;
  }): Promise<void> {
    const { context, config, issueNodeId } = params;

    // Best-effort: issue creation is the primary goal; project linking is secondary.
    try {
      const project = await this.getProject({ context, config });

      const addItemResult = await context.github.graphql<{
        addProjectV2ItemById: { item: { id: string } };
      }>({
        query: `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
              item { id }
            }
          }
        `,
        projectId: project.projectId,
        contentId: issueNodeId,
      });

      const itemId = addItemResult.addProjectV2ItemById.item.id;

      await this.trySetSingleSelectField({
        context,
        projectId: project.projectId,
        itemId,
        fieldName: 'Status',
        optionName: 'Todo',
        fields: project.fields,
      });
    } catch (_err) {
      // ignored intentionally
    }
  }

  private async getProject(params: {
    context: WebhookContext<any>;
    config: FollowUpTasksConfig;
  }): Promise<{
    projectId: string;
    fields: ProjectFieldInfo[];
  }> {
    const { context, config } = params;

    if (FollowUpTasks._projectCache) return FollowUpTasks._projectCache;

    const result = await context.github.graphql<{
      organization: {
        projectV2: {
          id: string;
          fields: { nodes: Array<any> };
        };
      };
    }>({
      query: `
        query($org: String!, $number: Int!) {
          organization(login: $org) {
            projectV2(number: $number) {
              id
              fields(first: 50) {
                nodes {
                  __typename
                  ... on ProjectV2FieldCommon {
                    id
                    name
                  }
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                    options {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `,
      org: context.repo().owner,
      number: config.projectNumber,
    });

    const fields: ProjectFieldInfo[] = (result.organization.projectV2.fields.nodes || []).map(
      (node: any) => ({
        id: node.id,
        name: node.name,
        options: node.options,
      }),
    );

    FollowUpTasks._projectCache = {
      projectId: result.organization.projectV2.id,
      fields,
    };
    return FollowUpTasks._projectCache;
  }

  private async trySetSingleSelectField(params: {
    context: WebhookContext<any>;
    projectId: string;
    itemId: string;
    fieldName: string;
    optionName: string;
    fields: ProjectFieldInfo[];
  }): Promise<void> {
    const { context, projectId, itemId, fieldName, optionName, fields } = params;
    const field = fields.find((f) => f.name === fieldName);
    const option = field?.options?.find((o) => o.name === optionName);
    if (!field?.id || !option?.id) return;

    await context.github.graphql({
      query: `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: { singleSelectOptionId: $optionId }
            }
          ) {
            projectV2Item { id }
          }
        }
      `,
      projectId,
      itemId,
      fieldId: field.id,
      optionId: option.id,
    });
  }
}

