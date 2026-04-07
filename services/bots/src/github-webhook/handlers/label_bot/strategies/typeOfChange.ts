import { PullRequest, PullRequestOpenedEvent } from '@octokit/webhooks-types';
import { HomeAssistantRepository } from '../../../github-webhook.const';
import { WebhookContext } from '../../../github-webhook.model';
import { ParsedPath } from '../../../utils/parse_path';
import { extractTasks } from '../../../utils/text_parser';

const CORE_BODYMATCHES = [
  {
    description: 'Bugfix (non-breaking change which fixes an issue)',
    labels: ['bugfix'],
  },
  {
    description: 'Dependency upgrade',
    labels: ['dependency'],
  },
  {
    description: 'New integration (thank you!)',
    labels: ['new-integration'],
  },
  {
    description: 'New feature (which adds functionality to an existing integration)',
    labels: ['new-feature'],
  },
  {
    description: 'Deprecation (breaking change to happen in the future)',
    labels: ['deprecation'],
  },
  {
    description: 'Breaking change (fix/feature causing existing functionality to break)',
    labels: ['breaking-change'],
  },
  {
    description: 'Code quality improvements to existing code or addition of tests',
    labels: ['code-quality'],
  },
];

// Matches Supervisor PR template checkboxes:
// https://github.com/home-assistant/supervisor/blob/667bd627423f4edf6cd199c22d3ef778a6324e37/.github/PULL_REQUEST_TEMPLATE.md?plain=1#L24-L28
const SUPERVISOR_BODYMATCHES = [
  {
    description: 'Dependency upgrade',
    labels: ['dependency'],
  },
  {
    description: 'Bugfix (non-breaking change which fixes an issue)',
    labels: ['bugfix'],
  },
  {
    description: 'New feature (which adds functionality to the supervisor)',
    labels: ['new-feature'],
  },
  {
    description: 'Breaking change (fix/feature causing existing functionality to break)',
    labels: ['breaking-change'],
  },
  {
    description: 'Code quality improvements to existing code or addition of tests',
    labels: ['refactor'],
  },
];

export default (context: WebhookContext<PullRequestOpenedEvent>, parsed: ParsedPath[]) => {
  const completedTasks = extractTasks((context.payload.pull_request as PullRequest).body || '')
    .filter((task) => {
      return task.checked;
    })
    .map((task) => task.description);

  const repo = context.payload.repository?.full_name;
  const bodyMatches =
    repo === HomeAssistantRepository.SUPERVISOR ? SUPERVISOR_BODYMATCHES : CORE_BODYMATCHES;

  let labels: string[] = [];
  bodyMatches.forEach((match) => {
    if (completedTasks.includes(match.description)) {
      match.labels.forEach((label) => {
        labels.push(label);
      });
    }
  });

  return labels;
};
