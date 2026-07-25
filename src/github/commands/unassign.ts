import type { Command, Effect } from "../engine/types.js";
import { fetchIntegrationManifest } from "../helpers/integration-manifest.js";

export const unassign: Command = {
  name: "unassign",
  description:
    "Removes the given integration domain's label and its code owners from the assignees.",
  args: "required",
  example: 'unassign "opensky"',
  permission: "author_or_code_owner",

  async handle(context) {
    if (context.args.length !== 1) throw new Error('usage: unassign "<domain>"');
    const domain = context.args[0];
    const manifest = await fetchIntegrationManifest(domain);
    const owners = await context.expandTeams(manifest?.codeowners ?? []);

    const assignees = (await context.target.assigneeLogins()).filter((login) =>
      owners.includes(login.toLowerCase()),
    );
    const effects: Effect[] = [{ type: "removeLabels", labels: [`integration: ${domain}`] }];
    if (assignees.length) effects.push({ type: "removeAssignees", assignees });
    return effects;
  },
};
