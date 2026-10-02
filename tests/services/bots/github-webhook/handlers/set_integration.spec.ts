// @ts-nocheck
import * as assert from 'assert';
import { WebhookContext } from '../../../../../bots/src/github-webhook/github-webhook.model';
import {
  SetIntegration,
  slugifyIntegrationName,
} from '../../../../../services/bots/src/github-webhook/handlers/set_integration';
import { mockWebhookContext } from '../../../../utils/test_context';

describe('SetIntegration', () => {
  let handler: SetIntegration;
  let mockContext: WebhookContext<any>;
  let getLabelResponse: any;

  beforeEach(function () {
    handler = new SetIntegration();
    getLabelResponse = {};
    mockContext = mockWebhookContext({
      eventType: 'issues.opened',
      github: {
        async issuesGetLabel() {
          return getLabelResponse;
        },
      },
    });
  });

  it('Integration label does exsist', async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/awesome';
    getLabelResponse = { name: 'integration: awesome' };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });

  it('Integration label does not exsist', async () => {
    mockContext.payload.issue.body = 'Link: https://www.home-assistant.io/integrations/not_valid';
    getLabelResponse = { status: 404 };
    await handler.handle(mockContext);
    assert.deepStrictEqual(mockContext.scheduledlabels, []);
  });

  it('Integration with underscore', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/awesome_integration';
    getLabelResponse = {
      name: 'integration: awesome_integration',
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome_integration']);
  });

  it('Integration with platform', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/sensor.awesome';
    getLabelResponse = {
      name: 'integration: awesome',
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });

  it('Integration with platform', async () => {
    mockContext.payload.issue.body =
      'Link: https://www.home-assistant.io/integrations/awesome.sensor';
    getLabelResponse = {
      name: 'integration: awesome',
    };
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: awesome']);
  });
});

// Mirrors how GitHub renders home-assistant/core .github/ISSUE_TEMPLATE/bug_report.yml
const coreIssueFormBody = ({ name, link }: { name?: string; link?: string }) =>
  `### The problem

Something is not working

### What version of Home Assistant Core has the issue?

core-2026.10.0

### What was the last working version of Home Assistant Core?

_No response_

### What type of installation are you running?

Home Assistant OS

### Integration causing the issue

${name || '_No response_'}

### Link to integration documentation on our website

${link || '_No response_'}

### Diagnostics information

_No response_

### Example YAML snippet

_No response_

### Anything in the logs that might be useful for us?

_No response_

### Additional information

_No response_`;

describe('SetIntegration issue form', () => {
  let handler: SetIntegration;
  let mockContext: WebhookContext<any>;
  let existingLabels: string[];
  let requestedLabels: string[];

  beforeEach(function () {
    handler = new SetIntegration();
    existingLabels = [];
    requestedLabels = [];
    mockContext = mockWebhookContext({
      eventType: 'issues.opened',
      github: {
        async issuesGetLabel({ name }) {
          requestedLabels.push(name);
          return existingLabels.includes(name) ? { name } : undefined;
        },
      },
    });
    mockContext.repository = 'home-assistant/core';
  });

  it('Uses the link when provided', async () => {
    mockContext.payload.issue.body = coreIssueFormBody({
      name: 'Philips Hue',
      link: 'https://www.home-assistant.io/integrations/hue',
    });
    existingLabels = ['integration: hue', 'integration: philips_hue'];
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: hue']);
    assert.deepStrictEqual(requestedLabels, ['integration: hue']);
  });

  it('Falls back to the integration name when no link is provided', async () => {
    mockContext.payload.issue.body = coreIssueFormBody({ name: 'Shelly' });
    existingLabels = ['integration: shelly'];
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: shelly']);
  });

  it('Slugifies the integration name', async () => {
    mockContext.payload.issue.body = coreIssueFormBody({ name: ' Google Generative AI ' });
    existingLabels = ['integration: google_generative_ai'];
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: google_generative_ai']);
  });

  it('Falls back to the integration name when the link does not match a label', async () => {
    mockContext.payload.issue.body = coreIssueFormBody({
      name: 'MQTT',
      link: 'https://www.home-assistant.io/integrations/not_valid',
    });
    existingLabels = ['integration: mqtt'];
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, ['integration: mqtt']);
    assert.deepStrictEqual(requestedLabels, ['integration: not_valid', 'integration: mqtt']);
  });

  it('Does not add a label when the integration name does not match a label', async () => {
    mockContext.payload.issue.body = coreIssueFormBody({ name: 'My smart lights' });
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.deepStrictEqual(requestedLabels, ['integration: my_smart_lights']);
  });

  it('Does not fall back to the integration name outside of core', async () => {
    mockContext.repository = 'home-assistant/home-assistant.io';
    mockContext.payload.issue.body = coreIssueFormBody({ name: 'Shelly' });
    existingLabels = ['integration: shelly'];
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.deepStrictEqual(requestedLabels, []);
  });

  it('Does not look up a label when neither name nor link are provided', async () => {
    mockContext.payload.issue.body = coreIssueFormBody({});
    await handler.handle(mockContext);

    assert.deepStrictEqual(mockContext.scheduledlabels, []);
    assert.deepStrictEqual(requestedLabels, []);
  });
});

describe('slugifyIntegrationName', () => {
  it('Slugifies names', () => {
    assert.strictEqual(slugifyIntegrationName('Shelly'), 'shelly');
    assert.strictEqual(slugifyIntegrationName('Google Generative AI'), 'google_generative_ai');
    assert.strictEqual(slugifyIntegrationName('Z-Wave'), 'z_wave');
    assert.strictEqual(slugifyIntegrationName('  zha  '), 'zha');
    assert.strictEqual(slugifyIntegrationName('Météo-France'), 'meteo_france');
    assert.strictEqual(slugifyIntegrationName('!!!'), '');
  });
});
