import { GithubClient } from '../../../../services/bots/src/github-webhook/github-webhook.model';

const statusParams = {
  owner: 'home-assistant',
  repo: 'core',
  sha: '3d0b15003d4c6e0029c5d5966f72d7efd4a26ee7',
  context: 'required-labels',
  state: 'success' as const,
};

const noCommitError = () =>
  Object.assign(new Error('No commit found for SHA: 3d0b15003d4c6e0029c5d5966f72d7efd4a26ee7'), {
    status: 422,
  });

describe('GithubClient.createCommitStatusWithRetry', () => {
  let client: GithubClient;
  let createCommitStatus: jest.Mock;

  beforeEach(() => {
    client = new GithubClient();
    createCommitStatus = jest.fn();
    // @ts-ignore partial mock
    client.repos = { createCommitStatus };
    // @ts-ignore partial mock
    client.log = { warn: jest.fn() };
  });

  it('returns the response when the first attempt succeeds', async () => {
    createCommitStatus.mockResolvedValue({ status: 201 });

    const response = await client.createCommitStatusWithRetry(statusParams);

    expect(response).toEqual({ status: 201 });
    expect(createCommitStatus).toHaveBeenCalledTimes(1);
  });

  it('retries when the commit is not found yet and succeeds', async () => {
    createCommitStatus
      .mockRejectedValueOnce(noCommitError())
      .mockRejectedValueOnce(noCommitError())
      .mockResolvedValue({ status: 201 });

    const response = await client.createCommitStatusWithRetry(statusParams, { backoffMs: 1 });

    expect(response).toEqual({ status: 201 });
    expect(createCommitStatus).toHaveBeenCalledTimes(3);
  });

  it('gives up without throwing when the commit never becomes available', async () => {
    createCommitStatus.mockRejectedValue(noCommitError());

    const response = await client.createCommitStatusWithRetry(statusParams, {
      retries: 2,
      backoffMs: 1,
    });

    expect(response).toBeUndefined();
    expect(createCommitStatus).toHaveBeenCalledTimes(3);
    expect(client.log.warn).toHaveBeenCalled();
  });

  it('rethrows other errors without retrying', async () => {
    createCommitStatus.mockRejectedValue(
      Object.assign(new Error('You have exceeded a secondary rate limit.'), { status: 403 }),
    );

    await expect(client.createCommitStatusWithRetry(statusParams)).rejects.toThrow(
      'secondary rate limit',
    );
    expect(createCommitStatus).toHaveBeenCalledTimes(1);
  });

  it('rethrows 422 errors that are not about missing commits', async () => {
    createCommitStatus.mockRejectedValue(
      Object.assign(new Error('Validation Failed'), { status: 422 }),
    );

    await expect(client.createCommitStatusWithRetry(statusParams)).rejects.toThrow(
      'Validation Failed',
    );
    expect(createCommitStatus).toHaveBeenCalledTimes(1);
  });
});
