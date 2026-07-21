import { describe, expect, it } from "vitest";
import { domainsFromLabels } from "../../../src/github/helpers/integration-domains.js";

describe("domainsFromLabels", () => {
  it("extracts domains from integration labels only", () => {
    expect(domainsFromLabels(["integration: hue", "bugfix", "integration: mqtt"])).toEqual([
      "hue",
      "mqtt",
    ]);
  });
});
