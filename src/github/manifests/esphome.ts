import { ignore, unignore } from "../commands/ignore.js";
import { update } from "../commands/update.js";
import { draftOnChangesRequested } from "../rules/draft-on-changes-requested.js";
import { mergeConflict } from "../rules/merge-conflict.js";
import { readyForReview } from "../rules/ready-for-review.js";
import { ESPHomeRepository } from "./esphome-org.js";
import type { RepoManifest } from "./types.js";

export const esphome: RepoManifest = {
  slug: ESPHomeRepository.ESPHOME,
  rules: [mergeConflict, draftOnChangesRequested, readyForReview],
  commands: [update, ignore, unignore],
};
