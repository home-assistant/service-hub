/**
 * Template blocks: fixed places in the dashboard templates that rules manage
 * via the `updateBlock` effect — typed args make the block visible, `null`
 * clears it. A separate system from the checks table — blocks have no
 * status, don't aggregate, and can't be waived. Like sections, their state
 * round-trips through the status comment (the comment is the database).
 *
 * Adding a block = add its args shape here AND its markup at the fixed spot
 * in the template(s); ids absent from this map are swept from persisted
 * comments on the next status write.
 */
export interface BlockArgsMap {
  /** Documentation / source / issue-search links per labeled integration. */
  "integration-links": {
    domains: { domain: string; docs: string; source: string; issues: string }[];
  };
  /** Per-label reporting guidance paragraphs (issue dashboard). */
  "reporting-guidance": {
    paragraphs: string[];
  };
}

export type BlockId = keyof BlockArgsMap;

/** Which blocks are visible, with their args — the persisted/render state. */
export type BlockStates = Partial<BlockArgsMap>;

export const BLOCK_IDS: readonly BlockId[] = ["integration-links", "reporting-guidance"];
