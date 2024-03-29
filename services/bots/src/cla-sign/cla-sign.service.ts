import { ServiceError } from '@lib/common';
import { ClaIssueLabel } from '@lib/common/github';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAppAuth } from '@octokit/auth-app';
import { DynamoDB } from 'aws-sdk';
import { GithubClient } from '../github-webhook/github-webhook.model';

export class ServiceRequestError extends ServiceError {}

@Injectable()
export class ClaSignService {
  private githubApiClient: GithubClient;
  private ddbClient: DynamoDB;
  private signersTableName: string;
  private pendingSignersTableName: string;
  private claSignId: string;
  private claSignSecret: string;

  constructor(configService: ConfigService) {
    this.githubApiClient = new GithubClient({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(configService.get('github.appId')),
        installationId: Number(configService.get('github.installationId')),
        privateKey: configService.get('github.keyContents'),
      },
    });

    this.ddbClient = new DynamoDB({ region: configService.get('dynamodb.cla.region') });

    this.signersTableName = configService.get('dynamodb.cla.signersTable');
    this.pendingSignersTableName = configService.get('dynamodb.cla.pendingSignersTable');
    this.claSignId = configService.get('github.claSignId');
    this.claSignSecret = configService.get('github.claSignSecret');
  }

  async handleClaSignature(
    headers: Record<string, any>,
    payload: Record<string, any>,
  ): Promise<void> {
    const signData: Record<string, any> = {
      ...payload,
      received_at: new Date().toISOString(),
      ip_address: headers['x-forwarded-for'],
      user_agent: headers['user-agent'],
    };

    // Check signData
    if (!signData.github_username) {
      throw new ServiceRequestError('Missing required data in payload', {
        data: { signData },
        service: 'cla-sign',
      });
    }

    const pendingRequest = (
      await this.ddbClient
        .getItem({
          TableName: this.pendingSignersTableName,
          Key: { github_username: { S: signData.github_username } },
        })
        .promise()
    ).Item;

    if (!pendingRequest) {
      throw new ServiceRequestError(
        `No pending request found for ${signData.github_username}. Are you signing the CLA with the same GitHub user that created the commits in the Pull Request?`,
        {
          data: { signData },
          service: 'cla-sign',
        },
      );
    }

    // Store signData
    try {
      await this.ddbClient
        .putItem({
          TableName: this.signersTableName,
          Item: {
            github_username: { S: signData.github_username },
            company_name: signData.company_name ? { S: signData.company_name } : { NULL: true },
            country: { S: signData.country },
            email: { S: signData.email },
            github_user_id: { S: signData.github_user_id },
            i_agree: { S: signData.i_agree },
            ip_address: { S: signData.ip_address || '' },
            name: { S: signData.name },
            received_at: { S: signData.received_at },
            region: { S: signData.region },
            signing_for: { S: signData.signing_for },
            user_agent: { S: signData.user_agent },
          },
        })
        .promise();
    } catch (err) {
      throw new ServiceError('Could not store signed data', {
        cause: err,
        data: { pendingRequest, signData, payload, headers },
        service: 'cla-sign',
      });
    }

    // Cleanup DDB Table
    await this.ddbClient
      .deleteItem({
        TableName: this.pendingSignersTableName,
        Key: { github_username: { S: signData.github_username } },
      })
      .promise();

    // Add cla-recheck label to the PR to trigger a new validation
    await this.githubApiClient.issues.addLabels({
      owner: pendingRequest.repository_owner.S,
      repo: pendingRequest.repository.S,
      issue_number: Number(pendingRequest.pr_number.S),
      labels: [ClaIssueLabel.CLA_RECHECK],
    });
  }

  async handleClaAuthorize(code: string): Promise<void> {
    const params = new URLSearchParams({
      code,
      client_id: this.claSignId,
      client_secret: this.claSignSecret,
    });

    const resp = await fetch(`https://github.com/login/oauth/access_token?${params.toString()}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
    });
    const data = await resp.json();
    if (!resp.ok || 'error' in data) {
      throw new ServiceError(data?.error_description || 'Could not authorize', {
        data: { data },
        service: 'cla-sign-authorize',
      });
    }
    return data;
  }
}
