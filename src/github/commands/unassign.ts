import { fetchIntegrationManifest } from "../../util/integration.js";
import type { Command, Effect } from "../engine/types.js";

export const unassign: Command = {
  name: "unassign",
  description:
    "Removes the given integration domain's label and its code owners from the assignees.",
  args: "required",
  example: 'unassign "opensky"',
  // The gate is against the domain argument, not the item's labels — the
  // sender must own the domain they're unassigning, so it's checked here.
  permission: "none",

  async handle(context) {
    if (context.args.length !== 1) throw new Error('usage: unassign "<domain>"');
    const domain = context.args[0];
    const manifest = await fetchIntegrationManifest(domain);
    const owners = await context.org.expandTeams(manifest?.codeowners ?? []);
    if (!owners.includes(context.sender.login.toLowerCase())) {
      throw new Error(`${context.sender.login} is not a code owner of "${domain}"`);
    }

    const assignees = (await context.target.assigneeLogins()).filter((login) =>
      owners.includes(login.toLowerCase()),
    );
    const effects: Effect[] = [{ type: "removeLabels", labels: [`integration: ${domain}`] }];
    if (assignees.length) effects.push({ type: "removeAssignees", assignees });
    return effects;
  },
};
