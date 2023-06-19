import { RestEndpointMethodTypes } from '@octokit/rest';
import { EventPayloadMap } from '@octokit/webhooks-types';
import { BaseWebhookHandler } from './handlers/base';

export const WEBHOOK_HANDLERS: BaseWebhookHandler[] = [];

export type PullRequestEventData = EventPayloadMap['pull_request'];
export type IssuesEventData = EventPayloadMap['issues'];
export type ListPullRequestFiles =
  RestEndpointMethodTypes['pulls']['listFiles']['response']['data'];
export type GetPullRequestParams = RestEndpointMethodTypes['pulls']['get']['parameters'];
export type GetPullRequestResponse = RestEndpointMethodTypes['pulls']['get']['response']['data'];
export type GetIssueParams = RestEndpointMethodTypes['issues']['get']['parameters'];
export type GetIssueResponse = RestEndpointMethodTypes['issues']['get']['response']['data'];
export type GetIssueLabelParams = RestEndpointMethodTypes['issues']['getLabel']['parameters'];
export type GetIssueLabelResponse =
  RestEndpointMethodTypes['issues']['getLabel']['response']['data'];

export type Repository = HomeAssistantRepository;

export enum Organization {
  HOME_ASSISTANT = 'home-assistant',
}

export enum HomeAssistantRepository {
  ADDONS = 'home-assistant/addons',
  ANDROID = 'home-assistant/android',
  BRANDS = 'home-assistant/brands',
  CLI = 'home-assistant/cli',
  COMPANION_HOME_ASSISTANT = 'home-assistant/companion.home-assistant',
  CORE = 'home-assistant/core',
  DEVELOPERS_HOME_ASSISTANT = 'home-assistant/developers.home-assistant',
  FRONTEND = 'home-assistant/frontend',
  HOME_ASSISTANT_IO = 'home-assistant/home-assistant.io',
  INTENTS = 'home-assistant/intents',
  IOS = 'home-assistant/iOS',
  OPERATING_SYSTEM = 'home-assistant/operating-system',
  SERVICE_HUB = 'home-assistant/service-hub',
  SUPERVISED_INSTALLER = 'home-assistant/supervised-installer',
  SUPERVISOR = 'home-assistant/supervisor',
}

export enum EventType {
  ISSUE_COMMENT_CREATED = 'issue_comment.created',
  ISSUES_LABELED = 'issues.labeled',
  ISSUES_OPENED = 'issues.opened',
  PULL_REQUEST_CLOSED = 'pull_request.closed',
  PULL_REQUEST_EDITED = 'pull_request.edited',
  PULL_REQUEST_LABELED = 'pull_request.labeled',
  PULL_REQUEST_OPENED = 'pull_request.opened',
  PULL_REQUEST_REOPENED = 'pull_request.reopened',
  PULL_REQUEST_READY_FOR_REVIEW = 'pull_request.ready_for_review',
  PULL_REQUEST_REVIEW_SUBMITTED = 'pull_request_review.submitted',
  PULL_REQUEST_SYNCHRONIZE = 'pull_request.synchronize',
  PULL_REQUEST_UNLABELED = 'pull_request.unlabeled',
}

export const entityComponents = new Set([
  'air_quality',
  'alarm_control_panel',
  'automation',
  'binary_sensor',
  'button',
  'calendar',
  'camera',
  'climate',
  'cover',
  'date',
  'datetime',
  'device_tracker',
  'fan',
  'geo_location',
  'humidifier',
  'image',
  'image_processing',
  'light',
  'lock',
  'mailbox',
  'media_player',
  'notify',
  'number',
  'remote',
  'scene',
  'select',
  'sensor',
  'siren',
  'stt',
  'switch',
  'time',
  'text',
  'tts',
  'vacuum',
  'update',
  'water_heater',
  'weather',
]);

export const coreComponents = new Set([
  ...entityComponents,
  'alexa',
  'api',
  'auth',
  'cloud',
  'config',
  'configurator',
  'conversation',
  'counter',
  'default_config',
  'demo',
  'discovery',
  'ffmpeg',
  'frontend',
  'google_assistant',
  'group',
  'hassio',
  'homeassistant',
  'history',
  'http',
  'input_boolean',
  'input_datetime',
  'input_number',
  'input_select',
  'input_text',
  'introduction',
  'ios',
  'logbook',
  'logger',
  'lovelace',
  'map',
  'mobile_app',
  'mqtt',
  'onboarding',
  'panel_custom',
  'panel_iframe',
  'persistent_notification',
  'person',
  'recorder',
  'script',
  'scene',
  'shell_command',
  'shopping_list',
  'stream',
  'sun',
  'system_health',
  'system_log',
  'timer',
  'updater',
  'webhook',
  'weblink',
  'websocket_api',
  'zone',
]);
