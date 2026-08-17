import { PullRequestLabeledEvent } from '@octokit/webhooks-types';
import yaml from 'js-yaml';
import { EventType, HomeAssistantRepository } from '../github-webhook.const';
import { WebhookContext } from '../github-webhook.model';
import { BaseWebhookHandler } from './base';

import { fetchPullRequestFilesFromContext } from '../utils/pull_request';
import { ParsedPath } from '../utils/parse_path';

const REQUIRED_MANIFEST_FIELDS = ['domain', 'name', 'codeowners'];

// integration_type values that mean "this talks to a real device/service",
// see https://developers.home-assistant.io/docs/core/pr_review_guide#22-manifest-manifestjson
const EXTERNAL_DEPENDENCY_INTEGRATION_TYPES = new Set(['device', 'hub', 'service']);

// Bronze-tier rule names, straight from home-assistant/core's own validator:
// https://github.com/home-assistant/core/blob/dev/script/hassfest/quality_scale.py
export const BRONZE_QUALITY_SCALE_RULES = [
  'action-setup',
  'appropriate-polling',
  'brands',
  'common-modules',
  'config-flow',
  'config-flow-test-coverage',
  'dependency-transparency',
  'docs-actions',
  'docs-conditions',
  'docs-high-level-description',
  'docs-installation-instructions',
  'docs-removal-instructions',
  'docs-triggers',
  'entity-event-setup',
  'entity-unique-id',
  'has-entity-name',
  'runtime-data',
  'test-before-configure',
  'test-before-setup',
  'unique-config-entry',
];

// Gold-tier rules that are easy to over-build into an initial submission; flagged
// (not blocked) so the author can justify keeping one if the integration needs it,
// see https://developers.home-assistant.io/docs/core/pr_review_guide#21-scope
const PREMATURE_GOLD_RULES = ['dynamic-devices', 'stale-devices'];

type RuleStatus = 'done' | 'exempt' | 'todo' | undefined;

const getRuleStatus = (value: unknown): RuleStatus => {
  if (value === 'done' || value === 'exempt' || value === 'todo') {
    return value;
  }
  if (value && typeof value === 'object') {
    const status = (value as { status?: unknown }).status;
    if (status === 'done' || status === 'exempt' || status === 'todo') {
      return status;
    }
  }
  return undefined;
};

export class NewIntegrationsHandler extends BaseWebhookHandler {
  public allowedEventTypes = [EventType.PULL_REQUEST_LABELED];
  public allowedRepositories = [HomeAssistantRepository.CORE];

  private getTestsIssue(parsed: ParsedPath[]): string | undefined {
    if (parsed.some((path) => path.type === 'test')) {
      return undefined;
    }

    return 'This PR does not include any tests. New integrations require tests, see the [development checklist](https://developers.home-assistant.io/docs/development_checklist/) for details.';
  }

  private async getManifestIssue(
    context: WebhookContext<PullRequestLabeledEvent>,
    parsed: ParsedPath[],
  ): Promise<string | undefined> {
    const manifestFile = parsed.find(
      (path) => path.type === 'component' && path.filename === 'manifest.json',
    );

    if (!manifestFile) {
      return 'This PR is missing a `manifest.json` for the new integration. See the [manifest documentation](https://developers.home-assistant.io/docs/creating_integration_manifest/) for the required format.';
    }

    let manifest: Record<string, unknown>;
    try {
      const { data } = await context.github.repos.getContent(
        context.repo({ path: manifestFile.path, ref: context.payload.pull_request.head.sha }),
      );
      manifest = JSON.parse(
        Buffer.from((data as { content: string }).content, 'base64').toString(),
      );
    } catch (_) {
      return 'Could not read `manifest.json` for this PR. Please make sure it is valid JSON.';
    }

    const missingFields = REQUIRED_MANIFEST_FIELDS.filter((field) => {
      const value = manifest[field];
      return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    });

    if (missingFields.length > 0) {
      return `The \`manifest.json\` is missing required field(s): ${missingFields
        .map((field) => `\`${field}\``)
        .join(
          ', ',
        )}. See the [manifest documentation](https://developers.home-assistant.io/docs/creating_integration_manifest/) for details.`;
    }

    const integrationType = manifest['integration_type'];
    const requirements = manifest['requirements'];
    const hasRequirements = Array.isArray(requirements) && requirements.length > 0;

    if (
      typeof integrationType === 'string' &&
      EXTERNAL_DEPENDENCY_INTEGRATION_TYPES.has(integrationType) &&
      !hasRequirements
    ) {
      return `This integration communicates with a device or service (\`integration_type: "${integrationType}"\`) but \`manifest.json\` has no \`requirements\`. Per the [PR review guide](https://developers.home-assistant.io/docs/core/pr_review_guide#22-manifest-manifestjson), communication code must be published as a separate PyPI library and listed under \`requirements\`, not embedded directly in the integration.`;
    }

    return undefined;
  }

  private async getQualityScaleIssue(
    context: WebhookContext<PullRequestLabeledEvent>,
    parsed: ParsedPath[],
  ): Promise<string | undefined> {
    const qualityScaleFile = parsed.find(
      (path) => path.type === 'component' && path.filename === 'quality_scale.yaml',
    );

    if (!qualityScaleFile) {
      return 'This PR is missing a `quality_scale.yaml` file. Every bronze-tier rule must be marked `done` or `exempt`. See the [quality scale docs](https://developers.home-assistant.io/docs/core/integration-quality-scale/) for the required format.';
    }

    let rules: Record<string, unknown>;
    try {
      const { data } = await context.github.repos.getContent(
        context.repo({ path: qualityScaleFile.path, ref: context.payload.pull_request.head.sha }),
      );
      const parsedYaml = yaml.load(
        Buffer.from((data as { content: string }).content, 'base64').toString(),
      ) as { rules?: Record<string, unknown> };
      rules = parsedYaml?.rules || {};
    } catch (_) {
      return 'Could not read or parse `quality_scale.yaml` for this PR. Please make sure it is valid YAML.';
    }

    const messages: string[] = [];

    const incompleteRules = BRONZE_QUALITY_SCALE_RULES.filter(
      (rule) => !['done', 'exempt'].includes(getRuleStatus(rules[rule])),
    );
    if (incompleteRules.length > 0) {
      messages.push(
        `\`quality_scale.yaml\` has bronze-tier rule(s) not marked \`done\` or \`exempt\`: ${incompleteRules
          .map((rule) => `\`${rule}\``)
          .join(
            ', ',
          )}. Per the [PR review guide](https://developers.home-assistant.io/docs/core/pr_review_guide#23-quality-scale-quality_scaleyaml), every bronze rule must be addressed before an initial PR is ready for review.`,
      );
    }

    const prematureGoldRules = PREMATURE_GOLD_RULES.filter(
      (rule) => getRuleStatus(rules[rule]) === 'done',
    );
    if (prematureGoldRules.length > 0) {
      messages.push(
        `\`quality_scale.yaml\` marks gold-tier rule(s) ${prematureGoldRules
          .map((rule) => `\`${rule}\``)
          .join(
            ', ',
          )} as \`done\`. These are usually out of scope for an initial new-integration PR — if the integration doesn't genuinely need this from day one, please defer it to a follow-up PR. If it does (e.g. entities only appear after a delayed device announcement), just say so in the PR description.`,
      );
    }

    return messages.length > 0 ? messages.join('\n\n') : undefined;
  }

  private getDiagnosticsIssue(parsed: ParsedPath[]): string | undefined {
    const hasDiagnostics = parsed.some((path) => path.filename === 'diagnostics.py');

    if (!hasDiagnostics) {
      return undefined;
    }

    return 'Per the [PR review guide](https://developers.home-assistant.io/docs/core/pr_review_guide#21-scope), `diagnostics.py` is a gold-level quality scale feature and should not be part of an initial new-integration PR. Please remove it and submit it as a follow-up PR once this one merges.';
  }

  private async getReconfigureFlowIssue(
    context: WebhookContext<PullRequestLabeledEvent>,
    parsed: ParsedPath[],
  ): Promise<string | undefined> {
    const configFlowFile = parsed.find(
      (path) => path.type === 'component' && path.filename === 'config_flow.py',
    );

    if (!configFlowFile) {
      return undefined;
    }

    let content: string;
    try {
      const { data } = await context.github.repos.getContent(
        context.repo({ path: configFlowFile.path, ref: context.payload.pull_request.head.sha }),
      );
      content = Buffer.from((data as { content: string }).content, 'base64').toString();
    } catch (_) {
      // If we can't read config_flow.py, don't block the PR on our own fetch failure.
      return undefined;
    }

    if (!/async_step_reconfigure/.test(content)) {
      return undefined;
    }

    return 'Per the [PR review guide](https://developers.home-assistant.io/docs/core/pr_review_guide#21-scope), a reconfigure flow (`async_step_reconfigure`) is a gold-level quality scale feature and should not be part of an initial new-integration PR. Please remove it and submit it as a follow-up PR once this one merges.';
  }

  private getPlatformIssue(parsed: ParsedPath[]): string | undefined {
    const hasMultiplePlatforms =
      parsed.filter((path) => path.type === 'platform' || path.type === 'non-entity-platform')
        .length > 1;

    if (!hasMultiplePlatforms) {
      return undefined;
    }

    return 'When adding new integrations, limit included platforms to a single platform. While we appreciate the effort, reviewing larger than necessary PRs slows down the review process. Please reduce this PR to a single platform. See the [review process](https://developers.home-assistant.io/docs/review-process/#home-assistant-core) for more details.';
  }

  private getBrandIssue(parsed: ParsedPath[]): string | undefined {
    const hasBrandFolder = parsed.some((path) => path.type === 'brand');

    if (!hasBrandFolder) {
      return undefined;
    }

    return 'This PR includes a `brand` folder inside the component. Brand assets should not be part of the core repository. Please refer to the [brand images documentation](https://developers.home-assistant.io/docs/core/integration/brand_images) for the correct approach.';
  }

  /**
   * When a new-integration label is added, check if the PR contains multiple platforms
   * (entity or non-entity platforms such as diagnostics) or a brand sub-folder.
   * If so, request changes with a combined message.
   */
  async handle(context: WebhookContext<PullRequestLabeledEvent>) {
    if (context.payload.label?.name !== 'new-integration') {
      return;
    }

    const pullRequestFiles = await fetchPullRequestFilesFromContext(context);
    const parsed = pullRequestFiles.map((file) => new ParsedPath(file));

    const issues = [
      this.getPlatformIssue(parsed),
      this.getBrandIssue(parsed),
      this.getTestsIssue(parsed),
      this.getDiagnosticsIssue(parsed),
      await this.getManifestIssue(context, parsed),
      await this.getReconfigureFlowIssue(context, parsed),
      await this.getQualityScaleIssue(context, parsed),
    ].filter((issue): issue is string => Boolean(issue));

    if (issues.length === 0) {
      return;
    }

    await context.github.pulls.createReview(
      context.pullRequest({
        body: issues.join('\n\n'),
        event: 'REQUEST_CHANGES',
      }),
    );
  }
}
