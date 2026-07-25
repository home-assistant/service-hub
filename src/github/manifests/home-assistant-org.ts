import { cla } from "../../cla/rule.js";
import type { Rule } from "../engine/types.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { hacktoberfest } from "../rules/hacktoberfest.js";
import { readyForReview } from "../rules/ready-for-review.js";
import { wth } from "../rules/wth.js";
import type { RepoManifest } from "./types.js";

/** home-assistant org repos, for rules that need to reference one by slug. */
export enum HomeAssistantRepository {
  ADDONS = "home-assistant/addons",
  ANDROID = "home-assistant/android",
  BRANDS = "home-assistant/brands",
  CLI = "home-assistant/cli",
  COMPANION_HOME_ASSISTANT = "home-assistant/companion.home-assistant",
  CORE = "home-assistant/core",
  DEVELOPERS_HOME_ASSISTANT = "home-assistant/developers.home-assistant",
  FRONTEND = "home-assistant/frontend",
  HOME_ASSISTANT_IO = "home-assistant/home-assistant.io",
  INTENTS = "home-assistant/intents",
  IOS = "home-assistant/iOS",
  OPERATING_SYSTEM = "home-assistant/operating-system",
  SUPERVISED_INSTALLER = "home-assistant/supervised-installer",
  SUPERVISOR = "home-assistant/supervisor",
}

/**
 * Rules every home-assistant org repo runs. Spread these into each repo
 * manifest (`...homeAssistantOrgRules`) so the manifest stays the single
 * top-to-bottom list of everything that runs on the repo.
 */
export const homeAssistantOrgRules: Rule[] = [
  hacktoberfest,
  wth,
  draftOnChangesRequested,
  readyForReview,
  cla,
];

/** Repos with a dedicated manifest of their own; excluded from the bare list below. */
const DEDICATED_MANIFESTS = new Set<string>([
  HomeAssistantRepository.CORE,
  HomeAssistantRepository.FRONTEND,
  HomeAssistantRepository.HOME_ASSISTANT_IO,
  HomeAssistantRepository.INTENTS,
  HomeAssistantRepository.SUPERVISOR,
]);

/**
 * Bare manifests for every other org repo, so the org-wide rules run there
 * too. A repo that grows repo-specific rules graduates to its own manifest
 * (add it to {@link DEDICATED_MANIFESTS}).
 */
export const homeAssistantOrgManifests: RepoManifest[] = Object.values(HomeAssistantRepository)
  .filter((slug) => !DEDICATED_MANIFESTS.has(slug))
  .map((slug) => ({ slug, rules: homeAssistantOrgRules }));
