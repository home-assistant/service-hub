import { fetchWithTimeout } from "../../util/fetch.js";
import type { SlashCommand } from "../engine/types.js";

interface VersionIndex {
  homeassistant: { default: string };
  hassos: { ova: string };
  supervisor: string;
}

async function fetchVersions(channel: "beta" | "stable"): Promise<VersionIndex> {
  const response = await fetchWithTimeout(`https://version.home-assistant.io/${channel}.json`);
  if (!response.ok) throw new Error(`Failed to fetch ${channel}.json: ${response.status}`);
  return (await response.json()) as VersionIndex;
}

export const versions: SlashCommand = {
  name: "versions",
  description: "Returns version information",

  async handle() {
    const [beta, stable] = await Promise.all([fetchVersions("beta"), fetchVersions("stable")]);
    return [
      {
        type: "reply" as const,
        embeds: [
          {
            fields: [
              { name: "Core stable", value: stable.homeassistant.default, inline: true },
              { name: "Core beta", value: beta.homeassistant.default, inline: true },
              { name: "OS stable", value: stable.hassos.ova, inline: true },
              { name: "OS beta", value: beta.hassos.ova, inline: true },
              { name: "Supervisor stable", value: stable.supervisor, inline: true },
              { name: "Supervisor beta", value: beta.supervisor, inline: true },
            ],
          },
        ],
      },
    ];
  },
};
