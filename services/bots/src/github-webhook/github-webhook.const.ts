import { RestEndpointMethodTypes } from '@octokit/rest';
import { EventPayloadMap } from '@octokit/webhooks-types';
import { BaseWebhookHandler } from './handlers/base';

export const HOME_ASSISTANT_ORG = 'home-assistant';

export const WEBHOOK_HANDLERS: BaseWebhookHandler[] = [];

export type PullRequestEventData = EventPayloadMap['pull_request'];
export type IssuesEventData = EventPayloadMap['issues'];
export type ListPullRequestFiles =
  RestEndpointMethodTypes['pulls']['listFiles']['response']['data'];
export type GetPullRequestParams = RestEndpointMethodTypes['pulls']['get']['parameters'];
export type GetPullRequestResponse = RestEndpointMethodTypes['pulls']['get']['response']['data'];
export type GetIssueParams = RestEndpointMethodTypes['issues']['get']['parameters'];
export type GetIssueResponse = RestEndpointMethodTypes['issues']['get']['response']['data'];

export enum Repository {
  BRANDS = 'brands',
  CORE = 'core',
  DEVELOPERS_HOME_ASSISTANT = 'developers.home-assistant',
  FRONTEND = 'frontend',
  HOME_ASSISTANT_IO = 'home-assistant.io',
}

export const entityComponents = new Set([
  'air_quality',
  'alarm_control_panel',
  'automation',
  'binary_sensor',
  'calendar',
  'camera',
  'climate',
  'cover',
  'device_tracker',
  'fan',
  'geo_location',
  'image_processing',
  'light',
  'lock',
  'mailbox',
  'media_player',
  'notify',
  'remote',
  'scene',
  'sensor',
  'switch',
  'tts',
  'vacuum',
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
