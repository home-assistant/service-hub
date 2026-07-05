import { describe, expect, it } from "bun:test";
import { applyOverrides, parseOverrides } from "../../../src/engine/dashboard/overrides.js";
import type { DashboardSection } from "../../../src/engine/dashboard/types.js";

describe("parseOverrides", () => {
  it("returns [] for null/empty body", () => {
    expect(parseOverrides(null)).toEqual([]);
    expect(parseOverrides("")).toEqual([]);
    expect(parseOverrides(undefined)).toEqual([]);
  });

  it("extracts a single override with id and reason", () => {
    const body =
      'Hello\n<!-- ha-bot:ignore id="merge-conflict" reason="Rebasing right before merge" -->\nworld';
    expect(parseOverrides(body)).toEqual([
      { id: "merge-conflict", reason: "Rebasing right before merge" },
    ]);
  });

  it("extracts multiple overrides in one body", () => {
    const body = [
      '<!-- ha-bot:ignore id="a" reason="ra" -->',
      "some prose",
      '<!-- ha-bot:ignore id="b" reason="rb" -->',
    ].join("\n");
    expect(parseOverrides(body)).toEqual([
      { id: "a", reason: "ra" },
      { id: "b", reason: "rb" },
    ]);
  });

  it("accepts attributes in either order", () => {
    const body = '<!-- ha-bot:ignore reason="r" id="x" -->';
    expect(parseOverrides(body)).toEqual([{ id: "x", reason: "r" }]);
  });

  it("supports multi-line reasons", () => {
    const body = '<!-- ha-bot:ignore id="x" reason="line one\nline two" -->';
    expect(parseOverrides(body)).toEqual([{ id: "x", reason: "line one\nline two" }]);
  });

  it("ignores tags missing id or reason", () => {
    expect(parseOverrides('<!-- ha-bot:ignore id="x" -->')).toEqual([]);
    expect(parseOverrides('<!-- ha-bot:ignore reason="r" -->')).toEqual([]);
    expect(parseOverrides('<!-- ha-bot:ignore id="" reason="r" -->')).toEqual([]);
    expect(parseOverrides('<!-- ha-bot:ignore id="x" reason="" -->')).toEqual([]);
  });

  it("does not match unrelated HTML comments", () => {
    expect(parseOverrides("<!-- regular comment -->")).toEqual([]);
    expect(parseOverrides('<!-- section:foo:{"id":"x"} -->')).toEqual([]);
  });
});

describe("applyOverrides", () => {
  const sections: DashboardSection[] = [
    { id: "a", title: "A", status: "fail", message: "broken" },
    { id: "b", title: "B", status: "pending", message: "wait" },
    { id: "c", title: "C", status: "pass", message: "ok" },
    { id: "d", title: "D", status: "skip", message: "n/a" },
  ];

  it("downgrades fail to warn and appends the reason while preserving the original message", () => {
    const result = applyOverrides(sections, [{ id: "a", reason: "by-design" }]);
    expect(result[0]).toEqual({
      id: "a",
      title: "A",
      status: "warn",
      message: "broken\nOverride: by-design",
    });
    expect(result.slice(1)).toEqual(sections.slice(1));
  });

  it("downgrades pending to warn", () => {
    const result = applyOverrides(sections, [{ id: "b", reason: "later" }]);
    expect(result[1]).toMatchObject({
      status: "warn",
      message: "wait\nOverride: later",
    });
  });

  it("does not modify pass or skip sections even when an override names them", () => {
    const result = applyOverrides(sections, [
      { id: "c", reason: "no-op" },
      { id: "d", reason: "no-op" },
    ]);
    expect(result[2]).toEqual(sections[2]);
    expect(result[3]).toEqual(sections[3]);
  });

  it("ignores overrides for unknown section ids", () => {
    const result = applyOverrides(sections, [{ id: "nonexistent", reason: "r" }]);
    expect(result).toEqual(sections);
  });

  it("returns the input unchanged when there are no overrides", () => {
    expect(applyOverrides(sections, [])).toEqual(sections);
  });
});
