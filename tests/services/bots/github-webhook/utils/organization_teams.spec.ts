import * as assert from 'assert';
import { mockWebhookContext } from '../../../../utils/test_context';
import { expandOrganizationTeams } from '../../../../../services/bots/src/github-webhook/utils/organization_teams';
import { WebhookContext } from 'services/bots/src/github-webhook/github-webhook.model';

describe('expandOrganizationTeams', () => {
  let context: WebhookContext<any>;
  beforeEach(() => {
    context = mockWebhookContext({
      payload: { repository: { name: 'test', owner: { login: 'example' } } },
    });
  });
  it('Resolve both user and team', async () => {
    // @ts-expect-error mocked function
    context.github.teams.listMembersInOrg.mockReturnValueOnce({
      data: [{ login: 'user1' }, { login: 'user2' }],
    });
    assert.deepStrictEqual(await expandOrganizationTeams(context, ['@test', '@example/test']), [
      'test',
      'example/test',
      'user1',
      'user2',
    ]);
    expect(context.github.teams.listMembersInOrg).toBeCalledTimes(1);
    expect(context.github.teams.listMembersInOrg).toHaveBeenCalledWith({
      org: 'example',
      team_slug: 'test',
    });
  });

  it('Ensure lowercase', async () => {
    assert.deepStrictEqual(await expandOrganizationTeams(context, ['@TEST']), ['test']);
    expect(context.github.teams.listMembersInOrg).not.toHaveBeenCalled();
  });
});
