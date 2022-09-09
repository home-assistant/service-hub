/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import convict from 'convict';
import dotenv from 'dotenv';

dotenv.config();

const conf = convict({
  sentryDsn: {
    default: '',
    doc: 'Sentry DSN for error and log reporting',
    env: 'SENTRY_DSN',
    format: String,
  },
  env: {
    default: 'development',
    doc: 'The current node.js environment',
    env: 'NODE_ENV',
    format: ['development', 'production'],
  },
  github: {
    token: {
      default: '',
      env: 'GITHUB_TOKEN',
      format: String,
    },
    webhookSecret: {
      default: '',
      env: 'GITHUB_WEBHOOK_SECRET',
      format: String,
    },
  },
  logging: {
    name: {
      default: 'bots',
      env: 'LOG_NAME',
      format: String,
    },
    level: {
      default: 'info',
      env: 'LOG_LEVEL',
      format: String,
    },
  },
  dynamodb: {
    cla: {
      region: {
        default: 'us-east-2',
        env: 'DYNAMODB_CLA_REGION',
        format: String,
      },
      signersTable: {
        default: '',
        env: 'DYNAMODB_CLA_SIGNERS_TABLE',
        format: String,
      },
      pendingSignersTable: {
        default: 'hihi',
        env: 'DYNAMODB_CLA_PENDING_SIGNERS_TABLE',
        format: String,
      },
    },
  },
});

conf.validate({ allowed: 'strict' });
const Config = conf;

export type AppConfig = ReturnType<typeof Config['getProperties']>;
export default Config;
