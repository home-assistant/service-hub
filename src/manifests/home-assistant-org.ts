import type { Rule } from "../engine/types.js";
import { hacktoberfest } from "../rules/hacktoberfest.js";
import { wth } from "../rules/wth.js";

/**
 * Rules every home-assistant org repo runs. Spread these into each repo
 * manifest (`...homeAssistantOrgRules`) so the manifest stays the single
 * top-to-bottom list of everything that runs on the repo.
 */
export const homeAssistantOrgRules: Rule[] = [hacktoberfest, wth];
