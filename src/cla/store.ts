import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import type { Env } from "../env.js";

/**
 * The CLA database, same DynamoDB tables (and item shapes) the legacy bot
 * used: a signers table keyed by GitHub login, and a pending-signers table
 * mapping a login to the PR that is waiting on their signature.
 */

/** A commit author the check found unsigned, and where. */
export interface PendingSigner {
  login: string;
  shas: string[];
  pr: { owner: string; repo: string; number: number };
}

/** What the sign flow needs to re-trigger the check after a signature. */
export interface PendingSignerRef {
  owner: string;
  repo: string;
  number: number;
}

/** The sign form's payload, plus request metadata stamped by the handler. */
export interface ClaSignature {
  github_username: string;
  [field: string]: string | undefined;
}

// Persisted signature fields, matching the legacy table items. Anything else
// the form sends is dropped rather than silently growing the schema.
const SIGNATURE_FIELDS = [
  "company_name",
  "country",
  "email",
  "github_user_id",
  "i_agree",
  "ip_address",
  "name",
  "received_at",
  "region",
  "signing_for",
  "user_agent",
] as const;

export interface ClaStore {
  hasSigned(login: string): Promise<boolean>;
  recordPendingSigners(signers: PendingSigner[]): Promise<void>;
  getPendingSigner(login: string): Promise<PendingSignerRef | undefined>;
  deletePendingSigner(login: string): Promise<void>;
  recordSignature(signature: ClaSignature): Promise<void>;
}

function createStore(client: DynamoDBClient, signersTable: string, pendingTable: string): ClaStore {
  return {
    async hasSigned(login) {
      const result = await client.send(
        new GetItemCommand({
          TableName: signersTable,
          Key: { github_username: { S: login } },
        }),
      );
      return result.Item !== undefined;
    },

    async recordPendingSigners(signers) {
      await Promise.all(
        signers.map(({ login, shas, pr }) =>
          client.send(
            new PutItemCommand({
              TableName: pendingTable,
              Item: {
                github_username: { S: login },
                commits: { L: shas.map((sha) => ({ S: sha })) },
                pr: { S: `${pr.owner}/${pr.repo}#${pr.number}` },
                repository_owner: { S: pr.owner },
                repository: { S: pr.repo },
                pr_number: { S: String(pr.number) },
                signatureRequestedAt: { S: new Date().toISOString() },
              },
            }),
          ),
        ),
      );
    },

    async getPendingSigner(login) {
      const result = await client.send(
        new GetItemCommand({
          TableName: pendingTable,
          Key: { github_username: { S: login } },
        }),
      );
      const item = result.Item;
      if (!item?.repository_owner?.S || !item.repository?.S || !item.pr_number?.S) {
        return undefined;
      }
      return {
        owner: item.repository_owner.S,
        repo: item.repository.S,
        number: Number(item.pr_number.S),
      };
    },

    async deletePendingSigner(login) {
      await client.send(
        new DeleteItemCommand({
          TableName: pendingTable,
          Key: { github_username: { S: login } },
        }),
      );
    },

    async recordSignature(signature) {
      await client.send(
        new PutItemCommand({
          TableName: signersTable,
          Item: {
            github_username: { S: signature.github_username },
            ...Object.fromEntries(
              SIGNATURE_FIELDS.map((field) => [
                field,
                signature[field] ? { S: signature[field] } : { NULL: true },
              ]),
            ),
          },
        }),
      );
    },
  };
}

const storeByEnv = new WeakMap<Env, ClaStore | undefined>();

/**
 * The DynamoDB-backed store for this env, or undefined when the CLA settings
 * are absent (CLA disabled). Memoized so every caller shares one client.
 */
export function dynamoClaStore(env: Env): ClaStore | undefined {
  if (!storeByEnv.has(env)) {
    const { CLA_DDB_REGION, CLA_SIGNERS_TABLE, CLA_PENDING_SIGNERS_TABLE } = env;
    storeByEnv.set(
      env,
      CLA_DDB_REGION && CLA_SIGNERS_TABLE && CLA_PENDING_SIGNERS_TABLE
        ? createStore(
            new DynamoDBClient({ region: CLA_DDB_REGION }),
            CLA_SIGNERS_TABLE,
            CLA_PENDING_SIGNERS_TABLE,
          )
        : undefined,
    );
  }
  return storeByEnv.get(env);
}
