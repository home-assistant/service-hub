import { ServiceError } from '@lib/common';
import { ClaIssueLabel } from '@lib/common/github';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { DynamoDB } from 'aws-sdk';

@Injectable()
export class ClaSignService {
  private githubApiClient: Octokit;
  private ddbClient: DynamoDB;
  private signersTableName: string;
  private pendingSignersTableName: string;

  constructor(configService: ConfigService) {
    this.githubApiClient = new Octokit({ auth: configService.get('github.token') });
    this.ddbClient = new DynamoDB({ region: configService.get('dynamodb.cla.region') });

    this.signersTableName = configService.get('dynamodb.cla.signersTable');
    this.pendingSignersTableName = configService.get('dynamodb.cla.pendingSignersTable');
  }

  async handleClaSignature(
    headers: Record<string, any>,
    payload: Record<string, any>,
  ): Promise<void> {
    const signData: Record<string, any> = {
      ...payload,
      received_at: new Date().toISOString(),
      ip_address: headers['x-forwarded-ip'],
      user_agent: headers['user-agent'],
    };

    // Check signData
    if (!signData.github_username) {
      throw new ServiceError('Missing required data in payload', { data: { signData } });
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
      throw new ServiceError('No pending request', { data: { signData } });
    }

    // Store signData
    await this.ddbClient
      .putItem({
        TableName: this.signersTableName,
        Item: {
          github_username: { S: signData.github_username },
          company_name: { S: signData.company_name || null },
          country: { S: signData.country },
          email: { S: signData.email },
          github_user_id: { S: signData.github_user_id },
          i_agree: { B: signData.i_agree },
          ip_address: { S: signData.ip_address },
          name: { S: signData.name },
          received_at: { S: signData.received_at },
          region: { S: signData.region },
          signing_for: { S: signData.signing_for },
          user_agent: { S: signData.user_agent },
        },
      })
      .promise();

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
}
