import { ignore, unignore } from "../../commands/ignore.js";
import { update } from "../../commands/update.js";
import { HomeAssistantRepository, homeAssistantOrgRules } from "../home-assistant-org.js";
import type { RepoManifest } from "../types.js";
import { changeType } from "./rules/change-type.js";

export const homeAssistantSupervisor: RepoManifest = {
  slug: HomeAssistantRepository.SUPERVISOR,
  rules: [changeType, ...homeAssistantOrgRules],
  commands: [update, ignore, unignore],
};
