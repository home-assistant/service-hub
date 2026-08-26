// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../services/bots/src/github-webhook/github-webhook.model';
import {
  BRONZE_QUALITY_SCALE_RULES,
  NewIntegrationsHandler,
} from '../../../../../services/bots/src/github-webhook/handlers/new_integrations';
import { mockWebhookContext } from '../../../../utils/test_context';
import { loadJsonFixture } from '../../../../utils/fixture';

const MANIFEST_PATH = 'homeassistant/components/my_integration/manifest.json';
const CONFIG_FLOW_PATH = 'homeassistant/components/my_integration/config_flow.py';
const QUALITY_SCALE_PATH = 'homeassistant/components/my_integration/quality_scale.yaml';
const TEST_FILE = { filename: 'tests/components/my_integration/test_sensor.py' };

const manifestContentResponse = (manifest: Record<string, unknown>) => ({
  data: { content: Buffer.from(JSON.stringify(manifest)).toString('base64') },
});

const yamlContentResponse = (yamlText: string) => ({
  data: { content: Buffer.from(yamlText).toString('base64') },
});

const VALID_MANIFEST = {
  domain: 'my_integration',
  name: 'My Integration',
  codeowners: ['@example'],
};

const buildBronzeQualityScaleYaml = (overrides: Record<string, string> = {}) =>
  `rules:\n${BRONZE_QUALITY_SCALE_RULES.map(
    (rule) => `  ${rule}: ${overrides[rule] ?? 'done'}`,
  ).join('\n')}\n`;

const VALID_QUALITY_SCALE_YAML = buildBronzeQualityScaleYaml();

// Default path-aware `getContent`: manifest.json and quality_scale.yaml both
// resolve to complete/valid content unless a test overrides it.
const defaultGetContent = (params: { path: string }) => {
  if (params.path === QUALITY_SCALE_PATH) {
    return Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML));
  }
  return Promise.resolve(manifestContentResponse(VALID_MANIFEST));
};

describe('NewIntegrationsHandler', () => {
  let handler: NewIntegrationsHandler;
  let mockContext: WebhookContext<any>;

  beforeEach(function () {
    handler = new NewIntegrationsHandler();
    mockContext = mockWebhookContext({
      eventType: 'pull_request.labeled',
      payload: loadJsonFixture('pull_request.opened', {
        label: { name: 'new-integration' },
      }),
      github: {
        pulls: {
          createReview: jest.fn(),
        },
        repos: {
          getContent: jest.fn(defaultGetContent),
        },
      },
    });
  });

  it('does nothing when the label is not new-integration', async () => {
    mockContext.payload.label = { name: 'bugfix' };
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/climate.py' },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('does nothing when a new-integration PR has a single platform, tests, a valid manifest and quality_scale.yaml', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when the PR contains multiple platforms', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/climate.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('single platform'));
    assert.ok(!call.body.includes('brand'));
  });

  it('counts a non-entity platform (e.g. diagnostics) toward the multiple-platforms check', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/diagnostics.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('single platform'));
    assert.ok(!call.body.includes('brand'));
  });

  it('does nothing when a new-integration PR has only a single non-entity platform', async () => {
    // Uses `intent.py` rather than `diagnostics.py` here since diagnostics.py is
    // separately (and unconditionally) flagged by getDiagnosticsIssue below.
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/intent.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when the PR contains a brand folder', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/brand/icon.png' },
      { filename: 'homeassistant/components/my_integration/brand/logo.png' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('brand'));
    assert.ok(
      call.body.includes('https://developers.home-assistant.io/docs/core/integration/brand_images'),
    );
    assert.ok(!call.body.includes('single platform'));
  });

  it('requests changes with a combined message when the PR has both multiple platforms and a brand folder', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/climate.py' },
      { filename: 'homeassistant/components/my_integration/brand/icon.png' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('single platform'));
    assert.ok(call.body.includes('brand'));
    assert.ok(
      call.body.includes('https://developers.home-assistant.io/docs/core/integration/brand_images'),
    );
  });

  it('requests changes when the PR has no tests', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('does not include any tests'));
  });

  it('requests changes when manifest.json is missing', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('missing a `manifest.json`'));
  });

  it('requests changes when manifest.json is missing required fields', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML))
        : Promise.resolve(manifestContentResponse({ domain: 'my_integration' })),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('`name`'));
    assert.ok(call.body.includes('`codeowners`'));
    assert.ok(!call.body.includes('`domain`'));
  });

  it('requests changes when a device integration has no requirements', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML))
        : Promise.resolve(
            manifestContentResponse({ ...VALID_MANIFEST, integration_type: 'device' }),
          ),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('no `requirements`'));
  });

  it('does nothing when a service integration has no requirements but iot_class is calculated', async () => {
    // Real-world case: home-assistant/core's collection_image integration is
    // integration_type "service" with no requirements at all, exempted from
    // dependency-transparency in its own quality_scale.yaml because it derives
    // state from data HA already has rather than talking to anything external.
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML))
        : Promise.resolve(
            manifestContentResponse({
              ...VALID_MANIFEST,
              integration_type: 'service',
              iot_class: 'calculated',
            }),
          ),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('does nothing when a device integration has requirements set', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML))
        : Promise.resolve(
            manifestContentResponse({
              ...VALID_MANIFEST,
              integration_type: 'device',
              requirements: ['my_integration_lib==1.0.0'],
            }),
          ),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('does nothing when a non-device integration (e.g. helper) has no requirements', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML))
        : Promise.resolve(
            manifestContentResponse({ ...VALID_MANIFEST, integration_type: 'helper' }),
          ),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when the PR includes diagnostics.py', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: 'homeassistant/components/my_integration/diagnostics.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('`diagnostics.py`'));
  });

  it('requests changes when config_flow.py implements a reconfigure flow', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) => {
      if (params.path === CONFIG_FLOW_PATH) {
        return Promise.resolve({
          data: {
            content: Buffer.from(
              'async def async_step_reconfigure(self, user_input=None):\n    pass',
            ).toString('base64'),
          },
        });
      }
      if (params.path === QUALITY_SCALE_PATH) {
        return Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML));
      }
      return Promise.resolve(manifestContentResponse(VALID_MANIFEST));
    });
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: CONFIG_FLOW_PATH },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('reconfigure flow'));
  });

  it('does nothing when config_flow.py has no reconfigure flow', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) => {
      if (params.path === CONFIG_FLOW_PATH) {
        return Promise.resolve({
          data: {
            content: Buffer.from(
              'async def async_step_user(self, user_input=None):\n    pass',
            ).toString('base64'),
          },
        });
      }
      if (params.path === QUALITY_SCALE_PATH) {
        return Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML));
      }
      return Promise.resolve(manifestContentResponse(VALID_MANIFEST));
    });
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: CONFIG_FLOW_PATH },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when manifest.json is not valid JSON', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(VALID_QUALITY_SCALE_YAML))
        : Promise.resolve({ data: { content: Buffer.from('not json').toString('base64') } }),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('Could not read `manifest.json`'));
  });

  it('requests changes when quality_scale.yaml is missing', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('missing a `quality_scale.yaml`'));
  });

  it('does nothing for a missing quality_scale.yaml when the integration is internal', async () => {
    // Real-world case: home-assistant/core's backup/http/auth integrations all
    // declare "quality_scale": "internal" and have no quality_scale.yaml at all.
    mockContext.github.repos.getContent = jest
      .fn()
      .mockResolvedValue(manifestContentResponse({ ...VALID_MANIFEST, quality_scale: 'internal' }));
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when a bronze rule is marked todo', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(
            yamlContentResponse(
              buildBronzeQualityScaleYaml({ 'config-flow-test-coverage': 'todo' }),
            ),
          )
        : Promise.resolve(manifestContentResponse(VALID_MANIFEST)),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('`config-flow-test-coverage`'));
  });

  it('does nothing when a bronze rule is marked exempt with a reason', async () => {
    const yamlText = `rules:\n${BRONZE_QUALITY_SCALE_RULES.map((rule) =>
      rule === 'action-setup'
        ? `  ${rule}:\n    status: exempt\n    comment: no actions in this integration`
        : `  ${rule}: done`,
    ).join('\n')}\n`;
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(yamlText))
        : Promise.resolve(manifestContentResponse(VALID_MANIFEST)),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
  });

  it('requests changes when quality_scale.yaml is not valid YAML', async () => {
    mockContext.github.repos.getContent = jest.fn((params: { path: string }) =>
      params.path === QUALITY_SCALE_PATH
        ? Promise.resolve(yamlContentResponse(':\n  not: [valid'))
        : Promise.resolve(manifestContentResponse(VALID_MANIFEST)),
    );
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    const call = mockContext.github.pulls.createReview.mock.calls[0][0];
    assert.strictEqual(call.event, 'REQUEST_CHANGES');
    assert.ok(call.body.includes('Could not read or parse `quality_scale.yaml`'));
  });

  it('converts the PR to draft when checks fail and it is not already a draft', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    expect(mockContext.github.graphql).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('convertPullRequestToDraft'),
      }),
    );
    expect(mockContext.github.graphql.mock.calls[0][0].query).toContain(
      mockContext.payload.pull_request.node_id,
    );
  });

  it('does not try to draft a PR that is already a draft', async () => {
    mockContext.payload.pull_request.draft = true;
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
    expect(mockContext.github.graphql).not.toHaveBeenCalled();
  });

  it('does not draft a PR whose checks all pass', async () => {
    mockContext._prFilesCache = [
      { filename: 'homeassistant/components/my_integration/__init__.py' },
      { filename: 'homeassistant/components/my_integration/sensor.py' },
      { filename: MANIFEST_PATH },
      { filename: QUALITY_SCALE_PATH },
      TEST_FILE,
    ];

    await handler.handle(mockContext);

    expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
    expect(mockContext.github.graphql).not.toHaveBeenCalled();
  });

  describe('review_requested', () => {
    beforeEach(function () {
      mockContext = mockWebhookContext({
        eventType: 'pull_request.review_requested',
        payload: loadJsonFixture('pull_request.opened', {
          requested_reviewer: { login: 'homeassistant', type: 'Bot' },
          pull_request: { labels: [{ name: 'new-integration' }] },
        }),
        github: {
          pulls: {
            createReview: jest.fn(),
          },
          repos: {
            getContent: jest.fn(defaultGetContent),
          },
        },
      });
    });

    it('does nothing when the requested reviewer is not this bot', async () => {
      mockContext.payload.requested_reviewer = { login: 'some-human', type: 'User' };
      mockContext._prFilesCache = [
        { filename: 'homeassistant/components/my_integration/__init__.py' },
        { filename: 'homeassistant/components/my_integration/sensor.py' },
        TEST_FILE,
      ];

      await handler.handle(mockContext);

      expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });

    it('does nothing when the PR lacks the new-integration label', async () => {
      mockContext.payload.pull_request.labels = [];
      mockContext._prFilesCache = [
        { filename: 'homeassistant/components/my_integration/__init__.py' },
        { filename: 'homeassistant/components/my_integration/sensor.py' },
        TEST_FILE,
      ];

      await handler.handle(mockContext);

      expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });

    it('re-checks and re-drafts when the bot is re-requested for review and checks still fail', async () => {
      mockContext._prFilesCache = [
        { filename: 'homeassistant/components/my_integration/__init__.py' },
        { filename: 'homeassistant/components/my_integration/sensor.py' },
        TEST_FILE,
      ];

      await handler.handle(mockContext);

      expect(mockContext.github.pulls.createReview).toHaveBeenCalledTimes(1);
      const call = mockContext.github.pulls.createReview.mock.calls[0][0];
      assert.ok(call.body.includes('re-request a review'));
      expect(mockContext.github.graphql).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('convertPullRequestToDraft'),
        }),
      );
    });

    it('does nothing when the bot is re-requested for review and all checks pass', async () => {
      mockContext._prFilesCache = [
        { filename: 'homeassistant/components/my_integration/__init__.py' },
        { filename: 'homeassistant/components/my_integration/sensor.py' },
        { filename: MANIFEST_PATH },
        { filename: QUALITY_SCALE_PATH },
        TEST_FILE,
      ];

      await handler.handle(mockContext);

      expect(mockContext.github.pulls.createReview).not.toHaveBeenCalled();
      expect(mockContext.github.graphql).not.toHaveBeenCalled();
    });
  });
});
