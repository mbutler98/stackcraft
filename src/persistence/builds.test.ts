import { describe, expect, it } from "vitest";
import { DEFAULT_DECISIONS } from "../data/scenarios";
import type { Build } from "../types";
import { awardCompletion, awardExplanationRead, awardReflection } from "../engine/progress";
import { EMPTY_PROGRESS, decodeShareHash, encodeShareHash, parseBuildJson, serializeBuild } from "./builds";

const valid: Build = {
  version: 1,
  name: "My stack",
  scenarioId: "launch-first-saas",
  nodes: [
    { id: "a", componentId: "nextjs", position: { x: 0, y: 0 } },
    { id: "b", componentId: "vercel", position: { x: 200, y: 0 } },
  ],
  edges: [{ id: "e1", source: "a", target: "b" }],
  decisions: { ...DEFAULT_DECISIONS },
};

describe("JSON import validation", () => {
  it("round-trips a valid build", () => {
    const res = parseBuildJson(serializeBuild(valid));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.build.nodes).toHaveLength(2);
  });

  it("rejects malformed JSON with a readable error", () => {
    const res = parseBuildJson("{ nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toMatch(/Not valid JSON/);
  });

  it("rejects unknown components and dangling edges with paths", () => {
    const bad = {
      ...valid,
      nodes: [...valid.nodes, { id: "c", componentId: "kubernetes", position: { x: 0, y: 0 } }],
      edges: [...valid.edges, { id: "e2", source: "a", target: "zzz" }],
    };
    const res = parseBuildJson(JSON.stringify(bad));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.join("\n")).toMatch(/nodes\[2\]\.componentId: Unknown component "kubernetes"/);
      expect(res.errors.join("\n")).toMatch(/edges\[1\]\.target/);
    }
  });

  it("rejects wrong versions, unknown scenarios and bad decisions", () => {
    for (const bad of [
      { ...valid, version: 2 },
      { ...valid, scenarioId: "nope" },
      { ...valid, decisions: { ...valid.decisions, authorization: "trust-me" } },
      { ...valid, nodes: [{ id: "a", componentId: "nextjs", position: { x: "1", y: 0 } }], edges: [] },
    ]) {
      expect(parseBuildJson(JSON.stringify(bad)).ok).toBe(false);
    }
  });

  it("rejects duplicate node ids", () => {
    const res = parseBuildJson(JSON.stringify({ ...valid, nodes: [valid.nodes[0], valid.nodes[0]], edges: [] }));
    expect(res.ok).toBe(false);
  });
});

describe("share links", () => {
  it("encodes and decodes a build via the URL hash", () => {
    const hash = encodeShareHash(valid);
    expect(hash.startsWith("#build=")).toBe(true);
    const res = decodeShareHash(hash);
    expect(res?.ok).toBe(true);
  });

  it("reports corrupted links", () => {
    const res = decodeShareHash("#build=%%%garbage");
    expect(res?.ok).toBe(false);
  });

  it("ignores unrelated hashes", () => {
    expect(decodeShareHash("#something")).toBeNull();
  });
});

describe("learning XP", () => {
  it("awards completion once and grants the badge", () => {
    const first = awardCompletion(EMPTY_PROGRESS, "launch-first-saas");
    expect(first.gained).toBe(100);
    expect(first.progress.badges).toContain("mvp-architect");
    expect(awardCompletion(first.progress, "launch-first-saas").gained).toBe(0);
  });

  it("only rewards the first reflection attempt", () => {
    const wrong = awardReflection(EMPTY_PROGRESS, "launch-first-saas", false);
    expect(wrong.gained).toBe(0);
    expect(awardReflection(wrong.progress, "launch-first-saas", true).gained).toBe(0);
  });

  it("caps explanation XP and dedupes", () => {
    let p = EMPTY_PROGRESS;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const r = awardExplanationRead(p, `rule-${i}`);
      p = r.progress;
      total += r.gained;
    }
    expect(total).toBe(100);
    expect(awardExplanationRead(p, "rule-1").gained).toBe(0);
  });
});
