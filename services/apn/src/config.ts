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
  logging: {
    name: {
      default: 'apn',
      env: 'LOG_NAME',
      format: String,
    },
    level: {
      default: 'info',
      env: 'LOG_LEVEL',
      format: String,
    },
  },
  apn: {
    certificate: {
      default: '',
      env: 'APN_CERTIFICATE',
      format: String,
    },
    keyId: {
      default: '',
      env: 'APN_KEY_ID',
      format: String,
    },
    teamId: {
      default: '',
      env: 'APN_TEAM_ID',
      format: String,
    },
  },
});

conf.validate({ allowed: 'strict' });
const Config = conf;

export type AppConfig = ReturnType<typeof Config['getProperties']>;
export default Config;
