import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';
import { EventType, HomeAssistantRepository } from '../../../../../services/bots/src/github-webhook/github-webhook.const';
import { FollowUpTasks } from '../../../../../services/bots/src/github-webhook/handlers/follow_up_tasks';

describe('FollowUpTasks', () => {
  let handler: FollowUpTasks;
  let mockContext: any;

  beforeEach(() => {
    handler = new FollowUpTasks();
    mockContext = mockWebhookContext({
      payload: loadJsonFixture('pull_request.closed'),
      eventType: EventType.PULL_REQUEST_CLOSED,
      // @ts-ignore partial mock
      github: {
        issues: {
          // @ts-ignore partial mock
          create: jest.fn().mockResolvedValue({ data: { node_id: 'ISSUE_NODE_ID' } }),
        },
      },
    });
    mockContext.github.graphql = jest.fn();
    mockContext.repository = HomeAssistantRepository.SUPERVISOR;
  });

  it('creates follow-up issue and adds it to OS/Supervisor project', async () => {
    mockContext.payload = loadJsonFixture('pull_request.closed', {
      pull_request: {
        title: 'Fix thing',
        html_url: 'https://github.com/home-assistant/supervisor/pull/42',
        merged: true,
        base: { ref: 'main' },
        labels: [{ name: 'needs-core' }, { name: 'unrelated' }],
      },
    });

    (mockContext.github.graphql as any)
      // issue type lookup
      .mockResolvedValueOnce({
        repository: {
          issueTypes: {
            nodes: [
              { id: 'ISSUE_TYPE_TASK', name: 'Task' },
              { id: 'ISSUE_TYPE_BUG', name: 'Bug' },
            ],
          },
        },
      })
      // set issue type
      .mockResolvedValueOnce({ updateIssue: { issue: { id: 'ISSUE_NODE_ID' } } })
      // project lookup
      .mockResolvedValueOnce({
        organization: {
          projectV2: {
            id: 'PROJECT_ID',
            fields: {
              nodes: [
                {
                  id: 'FIELD_STATUS',
                  name: 'Status',
                  options: [{ id: 'OPT_TODO', name: 'Todo' }],
                },
              ],
            },
          },
        },
      })
      // add item
      .mockResolvedValueOnce({
        addProjectV2ItemById: { item: { id: 'ITEM_ID' } },
      })
      // set Status
      .mockResolvedValueOnce({ updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_ID' } } });

    await handler.handle(mockContext);

    expect(mockContext.github.issues.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'home-assistant',
        repo: 'supervisor',
        title: 'Follow-up tasks for PR "Fix thing"',
      }),
    );
    const bodyArg = (mockContext.github.issues.create as any).mock.calls[0][0].body as string;
    expect(bodyArg).toContain('`needs-core`');
    expect(bodyArg).toContain('https://github.com/home-assistant/supervisor/pull/42');

    expect(mockContext.github.graphql).toHaveBeenCalled();
    expect((mockContext.github.graphql as any).mock.calls.length).toBe(5);
  });

  it('does nothing if not merged', async () => {
    mockContext.payload = loadJsonFixture('pull_request.closed', {
      pull_request: { merged: false, base: { ref: 'main' }, labels: [{ name: 'needs-core' }] },
    });

    await handler.handle(mockContext);
    expect(mockContext.github.issues.create).not.toHaveBeenCalled();
  });

  it('does nothing if merged to non-main', async () => {
    mockContext.payload = loadJsonFixture('pull_request.closed', {
      pull_request: { merged: true, base: { ref: 'dev' }, labels: [{ name: 'needs-core' }] },
    });

    await handler.handle(mockContext);
    expect(mockContext.github.issues.create).not.toHaveBeenCalled();
  });

  it('does nothing if no follow-up labels are present', async () => {
    mockContext.payload = loadJsonFixture('pull_request.closed', {
      pull_request: { merged: true, base: { ref: 'main' }, labels: [{ name: 'unrelated' }] },
    });

    await handler.handle(mockContext);
    expect(mockContext.github.issues.create).not.toHaveBeenCalled();
  });
});

