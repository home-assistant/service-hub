import { HomeAssistantRepository, Repository } from '../../github-webhook.const';

export interface LabelAction {
  comment: string;
  close?: boolean;
  closeReason?: 'completed' | 'not_planned';
}

// In comments, {issue-author} is replaced with the username of the issue
// author and {repository} with the full name (owner/repo) of the repository
// the issue was reported in.

const issueBelongsTo = (name: string, repository: HomeAssistantRepository): LabelAction => ({
  comment:
    ':wave: @{issue-author}, thanks for reporting an issue!\n\n' +
    `It looks like this issue is related to ${name}. Please check the ` +
    `[${name}](https://github.com/${repository}/issues) repository, the ` +
    'issue might have been reported already. Open a new issue in that ' +
    "repository if you can't find a matching issue.",
  close: true,
  closeReason: 'not_planned',
});

const CORE_ISSUE = issueBelongsTo('Home Assistant Core', HomeAssistantRepository.CORE);
const FRONTEND_ISSUE = issueBelongsTo('Home Assistant Frontend', HomeAssistantRepository.FRONTEND);
const OS_ISSUE = issueBelongsTo(
  'Home Assistant Operating System',
  HomeAssistantRepository.OPERATING_SYSTEM,
);
const SUPERVISOR_ISSUE = issueBelongsTo(
  'Home Assistant Supervisor',
  HomeAssistantRepository.SUPERVISOR,
);

const ASSUME_FIXED: LabelAction = {
  comment:
    ':wave: @{issue-author}, thanks for reporting an issue!\n\n' +
    'This issue is assumed to be fixed in the latest stable release. Please ' +
    'reopen in case you can still reproduce the issue with the latest stable ' +
    'release. You can find the latest stable release at ' +
    'https://github.com/{repository}/releases/latest',
  close: true,
  closeReason: 'not_planned',
};

const NEW_FEATURE: LabelAction = {
  comment:
    ':wave: @{issue-author}, thanks for your input!\n\n' +
    'We use this issue tracker to track issues of currently supported ' +
    'features. Your request appears to request a new feature. We track ' +
    'potential new features in the [Feature Request section of our Community ' +
    'Forum](https://community.home-assistant.io/c/feature-requests/13). ' +
    'Please check if someone already requested a similar feature, or create ' +
    'a new feature request in that forum. Thank you!',
  close: true,
  closeReason: 'not_planned',
};

const DOCKER_CORRUPTION: LabelAction = {
  comment:
    ':wave: @{issue-author}, thanks for reporting an issue!\n\n' +
    'Home Assistant uses Docker container images under the hood to run all ' +
    'parts of the system (Home Assistant Core, add-ons and other ' +
    'components). The symptoms described here (e.g. 0-byte or empty files, ' +
    'missing files or directories, or corrupt binaries inside a container) ' +
    'indicate that this Docker image storage got corrupted on your system. ' +
    'This is a local problem, typically caused by a power loss or forced ' +
    'reset while the system was writing to disk, or by failing storage. It ' +
    'is not a problem in the published image or in Home Assistant itself.\n\n' +
    '**What to do:** Create a full backup and download it to another ' +
    'machine. Then reinstall Home Assistant OS and restore the backup. This ' +
    'rewrites all container images and reliably resolves the problem.\n\n' +
    'For those familiar with Docker, some background on why this is the ' +
    'only reliable fix: Docker verifies image checksums only while pulling. ' +
    'Once an image is written to disk, its integrity is never checked ' +
    'again, so corruption can stay dormant until the affected container is ' +
    'recreated, e.g. on a host reboot. Deleting and re-pulling the affected ' +
    'image does not necessarily help either: image layers are shared ' +
    'between images and reused across versions, and `docker pull` skips ' +
    'layers it believes are already present locally, so the corrupted data ' +
    'survives a re-pull. A dedicated feature to reset the Docker image ' +
    'storage completely is tracked in ' +
    '[#6555](https://github.com/home-assistant/supervisor/issues/6555).',
  close: true,
  closeReason: 'not_planned',
};

export const repositoryLabelActions: Partial<Record<Repository, Record<string, LabelAction>>> = {
  [HomeAssistantRepository.OPERATING_SYSTEM]: {
    'assume-fixed': ASSUME_FIXED,
    'core-issue': CORE_ISSUE,
    'frontend-issue': FRONTEND_ISSUE,
    'supervisor-issue': SUPERVISOR_ISSUE,
    'new-feature': NEW_FEATURE,
  },
  [HomeAssistantRepository.SUPERVISOR]: {
    'core-issue': CORE_ISSUE,
    'frontend-issue': FRONTEND_ISSUE,
    'os-issue': OS_ISSUE,
    'docker-corruption': DOCKER_CORRUPTION,
  },
};
