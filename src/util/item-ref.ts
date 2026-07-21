/** Reference to an issue or pull request: repo coordinates plus number. */
export interface ItemRef {
  owner: string;
  repo: string;
  number: number;
}

/** The ref's `owner/repo` slug, e.g. for comparison against a Repository enum. */
export function slugOf(ref: Pick<ItemRef, "owner" | "repo">): string {
  return `${ref.owner}/${ref.repo}`;
}
