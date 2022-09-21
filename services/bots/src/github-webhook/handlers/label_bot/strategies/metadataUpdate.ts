import { PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';

const METADATA_FILES = new Set([
  'CODEOWNERS',
  'manifest.json',
  'requirements_all.txt',
  'requirements_docs.txt',
  'requirements_test.txt',
  'requirements_test_all.txt',
  'services.yaml',
]);

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) =>
  parsed.every((fil) => METADATA_FILES.has(fil.filename)) ? ['metadata-only'] : [];
