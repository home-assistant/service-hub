import type { RegistryConfig } from "../rules/dispatch.js";
import { mentionCodeOwners } from "../rules/mention-code-owners.js";
import type { Rule } from "../rules/types.js";

const coreRules: Rule[] = [
  mentionCodeOwners({
    pathPattern: (name) => `homeassistant/components/${name}/*`,
  }),
];

export const issueConfig: RegistryConfig = {
  organizations: {},
  repositories: {
    "home-assistant/core": coreRules,
    // Test fork
    "justanotherariel/hass_core": coreRules,
  },
};
