import { describe, expect, it } from "vitest";
import {
  domainsFromFiles,
  domainsFromLabels,
} from "../../../../../src/github/manifests/home-assistant-core/helpers/integration-domains.js";

describe("domainsFromFiles", () => {
  it("derives unique integration domains from changed file paths", () => {
    const files = [
      { filename: "homeassistant/components/hue/light.py" },
      { filename: "homeassistant/components/hue/sensor.py" },
      { filename: "homeassistant/components/zwave_js/api.py" },
    ];
    expect(domainsFromFiles(files as never)).toEqual(["hue", "zwave_js"]);
  });

  it("ignores files outside integration directories", () => {
    const files = [{ filename: "homeassistant/core.py" }, { filename: "README.md" }];
    expect(domainsFromFiles(files as never)).toEqual([]);
  });
});

describe("domainsFromLabels", () => {
  it("extracts domains from integration labels only", () => {
    expect(domainsFromLabels(["integration: hue", "bugfix", "integration: mqtt"])).toEqual([
      "hue",
      "mqtt",
    ]);
  });
});
