import { CommandHomeassistantIntegration } from './integration';
import { CommandHomeassistantMessage } from './message';
import { CommandHomeAssistantMy } from './my';
import { CommandHomeAssistantVersions } from './versions';

export const CommandsHomeassistant = [
  CommandHomeassistantIntegration,
  CommandHomeassistantMessage,
  CommandHomeAssistantMy,
  CommandHomeAssistantVersions,
];
