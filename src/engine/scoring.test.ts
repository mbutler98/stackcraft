import { describe, expect, it } from "vitest";
import { COMPONENTS } from "../data/components";
import { CHALLENGES, DEFAULT_DECISIONS, SCENARIOS, getScenario } from "../data/scenarios";
import { graph, solutionA, solutionB, solutionC } from "../test/fixtures";
import { DIMENSIONS } from "../types";
import { diffEvaluations, isExplained } from "./explanations";
import { checkCompletion, evaluate, normalizeWeights, weightedFit } from "./scoring";
import { buildGraphContext } from "./validation";

describe("catalog", () => {
  it("seeds exactly 25 components with required fields", () => {
    expect(COMPONENTS).toHaveLength(25);
    const ids = new Set(COMPONENTS.map((c) => c.id));
    expect(ids.size).toBe(25);
    for (const c of COMPONENTS) {
      expect(c.role.length).toBeGreaterThan(0);
      expect(c.tradeoffs.length).toBeGreaterThan(0);
      expect(c.docsUrl).toMatch(/^https:\/\//);
      expect(c.pricingModel.length).toBeGreaterThan(0);
      expect(c.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("never gives a cache automatic positive points", () => {
    const redis = COMPONENTS.find((c) => c.id === "redis")!;
    expect(Object.values(redis.dimensionEffects).every((n) => (n ?? 0) <= 0)).toBe(true);
  });

  it("has three playable challenges with reflections", () => {
    expect(CHALLENGES).toHaveLength(3);
    for (const c of CHALLENGES) expect(c.reflection).toBeDefined();
  });
});

describe("weights", () => {
  it("normalizes to sum 1", () => {
    const w = normalizeWeights({ developerVelocity: 3, simplicity: 3, costEfficiency: 2, reliability: 1, scalability: 0.5, performance: 0.5 });
    const sum = DIMENSIONS.reduce((a, d) => a + w[d], 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(w.developerVelocity).toBeCloseTo(0.3, 10);
  });

  it("treats all-zero and negative weights safely", () => {
    const w = normalizeWeights({ developerVelocity: 0, simplicity: 0, costEfficiency: 0, reliability: -5, scalability: 0, performance: 0 });
    for (const d of DIMENSIONS) expect(w[d]).toBeCloseTo(1 / 6, 10);
  });

  it("computes the weighted mean", () => {
    const scores = { developerVelocity: 100, costEfficiency: 0, scalability: 0, reliability: 0, performance: 0, simplicity: 0 };
    const weights = { developerVelocity: 1, costEfficiency: 1, scalability: 0, reliability: 0, performance: 0, simplicity: 0 };
    expect(weightedFit(scores, weights)).toBe(50);
    // Scaling all weights doesn't change the result.
    expect(weightedFit(scores, { ...weights, developerVelocity: 10, costEfficiency: 10 })).toBe(50);
  });
});

describe("graph validation", () => {
  it("flags missing nodes, self loops, duplicates and incompatible edges", () => {
    const nodes = [
      { id: "a", componentId: "nextjs", position: { x: 0, y: 0 } },
      { id: "b", componentId: "vercel", position: { x: 0, y: 0 } },
      { id: "c", componentId: "redis", position: { x: 0, y: 0 } },
      { id: "d", componentId: "posthog", position: { x: 0, y: 0 } },
    ];
    const ctx = buildGraphContext(nodes, [
      { id: "ok", source: "a", target: "b" },
      { id: "dup", source: "b", target: "a" },
      { id: "ghost", source: "a", target: "zzz" },
      { id: "loop", source: "a", target: "a" },
      { id: "bad", source: "c", target: "d" }, // cache ↔ analytics
    ]);
    expect(ctx.validEdges.map((e) => e.id)).toEqual(["ok"]);
    const kinds = Object.fromEntries(ctx.edgeIssues.map((i) => [i.edgeId, i.kind]));
    expect(kinds).toEqual({ dup: "duplicate", ghost: "missing-node", loop: "self-loop", bad: "incompatible" });
    expect(ctx.activeNodeIds.has("c")).toBe(false);
  });

  it("ignores invalid edges when scoring", () => {
    const base = graph(["ui", "nextjs"], ["host", "vercel"]).link("ui", "host");
    const withJunk = graph(["ui", "nextjs"], ["host", "vercel"]).link("ui", "host").link("ui", "missing");
    const a = evaluate(base.input("sandbox"));
    const b = evaluate(withJunk.input("sandbox"));
    expect(b.scores).toEqual(a.scores);
    expect(b.edgeIssues).toHaveLength(1);
  });

  it("doesn't count unconnected components", () => {
    const g = graph(["ui", "nextjs"], ["host", "vercel"], ["db", "supabase"]).link("ui", "host");
    const ev = evaluate(g.input("launch-first-saas"));
    const data = ev.constraints.find((c) => c.id === "req:data")!;
    expect(data.status).toBe("fail");
    expect(data.detail).toMatch(/not connected/);
    expect(ev.rules.some((r) => r.ruleId === "unconnected")).toBe(true);
  });
});

describe("hard requirements", () => {
  it("reports required capabilities as blockers", () => {
    const ev = evaluate(graph(["ui", "nextjs"]).input("launch-first-saas"));
    const failing = ev.blockers.map((b) => b.id);
    expect(failing).toEqual(expect.arrayContaining(["req:host", "req:data", "req:auth", "req:billing", "req:errors"]));
  });

  it("keeps a blocker visible even when the average is high", () => {
    const g = solutionA();
    const ev = evaluate(g.input("launch-first-saas", {}, { weights: { ...getScenario("launch-first-saas").targetWeights } }));
    // Webhook decision missing → hard failure regardless of fit.
    expect(ev.blockers.map((b) => b.id)).toContain("req:webhooks");
    expect(checkCompletion(g.input("launch-first-saas")).complete).toBe(false);
  });

  it("requires an authorization strategy in the multi-tenant challenge", () => {
    const g = solutionB();
    const ev = evaluate(g.input("collaborative-workspace"));
    expect(ev.blockers.map((b) => b.id)).toContain("req:authz");
    expect(ev.rules.find((r) => r.ruleId === "authz-missing")?.severity).toBe("blocker");
    const fixed = evaluate(g.input("collaborative-workspace", { authorization: "row-level-security" }));
    expect(fixed.blockers).toHaveLength(0);
    expect(fixed.rules.some((r) => r.ruleId === "authz-rls")).toBe(true);
  });

  it("flags secret-holding services with no server runtime", () => {
    const g = graph(["ui", "vite-react"], ["host", "github-pages"], ["pay", "stripe-billing"])
      .link("ui", "host")
      .link("ui", "pay");
    const ev = evaluate(g.input("sandbox"));
    const dep = ev.rules.find((r) => r.ruleId === "dependency-missing");
    expect(dep).toBeDefined();
    expect(dep!.why).toMatch(/secret/);
  });
});

describe("scenario-specific cache behaviour", () => {
  const withCache = () =>
    graph(["ui", "nextjs"], ["host", "vercel"], ["db", "supabase"], ["cache", "redis"])
      .link("ui", "host")
      .link("host", "db")
      .link("host", "cache");
  const withoutCache = () =>
    graph(["ui", "nextjs"], ["host", "vercel"], ["db", "supabase"]).link("ui", "host").link("host", "db");

  it("lowers fit when there is no repeated-read bottleneck", () => {
    const a = evaluate(withoutCache().input("launch-first-saas"));
    const b = evaluate(withCache().input("launch-first-saas"));
    expect(b.scores.performance).toBe(a.scores.performance);
    expect(b.scores.simplicity).toBeLessThan(a.scores.simplicity);
    expect(b.weightedFit).toBeLessThan(a.weightedFit);
    expect(b.rules.some((r) => r.ruleId === "cache-unjustified")).toBe(true);
  });

  it("is speculative before monitoring reveals the bottleneck", () => {
    const ev = evaluate(withCache().input("growth-without-overengineering"));
    expect(ev.hiddenSignals).toContain("repeatedReads");
    expect(ev.rules.some((r) => r.ruleId === "cache-unmeasured")).toBe(true);
    expect(ev.rules.some((r) => r.ruleId === "cache-justified")).toBe(false);
  });

  it("helps performance once repeated reads are measured", () => {
    const g = withCache();
    g.nodes.push({ id: "err", componentId: "sentry", position: { x: 0, y: 0 } });
    g.link("ui", "err");
    const before = graph(["ui", "nextjs"], ["host", "vercel"], ["db", "supabase"], ["err", "sentry"])
      .link("ui", "host")
      .link("host", "db")
      .link("ui", "err");
    const a = evaluate(before.input("growth-without-overengineering"));
    const b = evaluate(g.input("growth-without-overengineering", { cacheInvalidation: "ttl-cache-aside" }));
    expect(a.rules.some((r) => r.ruleId === "read-bottleneck-unaddressed")).toBe(true);
    expect(b.rules.some((r) => r.ruleId === "cache-justified")).toBe(true);
    expect(b.scores.performance).toBeGreaterThan(a.scores.performance);
  });

  it("follows sandbox workload toggles", () => {
    const g = withCache();
    const sandbox = getScenario("sandbox");
    const workload = { ...sandbox.workload, signals: { ...sandbox.workload.signals } };
    const off = evaluate(g.input("sandbox", {}, { workload }));
    const on = evaluate(g.input("sandbox", {}, { workload: { ...workload, signals: { ...workload.signals, repeatedReads: true } } }));
    expect(on.scores.performance).toBeGreaterThan(off.scores.performance);
  });
});

describe("no automatic bonus for more components", () => {
  it("adding components with no job never raises any score", () => {
    const base = solutionA();
    const baseEv = evaluate(base.input("launch-first-saas", { billingWebhooks: "server-verified" }));
    for (const extra of ["redis", "algolia", "trigger-dev", "qstash", "turnstile", "neon", "clerk", "render", "cloudflare-workers", "s3"]) {
      const g = solutionA();
      g.nodes.push({ id: "x", componentId: extra, position: { x: 0, y: 0 } });
      g.link("host", "x");
      const ev = evaluate(g.input("launch-first-saas", { billingWebhooks: "server-verified" }));
      expect(ev.weightedFit, extra).toBeLessThanOrEqual(baseEv.weightedFit);
    }
  });

  it("duplicating a component never adds its benefit twice", () => {
    const one = evaluate(solutionA().input("launch-first-saas", { billingWebhooks: "server-verified" }));
    const g = solutionA();
    g.nodes.push({ id: "db2", componentId: "supabase", position: { x: 0, y: 0 } });
    g.link("host", "db2");
    const two = evaluate(g.input("launch-first-saas", { billingWebhooks: "server-verified" }));
    for (const d of DIMENSIONS) expect(two.scores[d], d).toBeLessThanOrEqual(one.scores[d]);
  });
});

describe("determinism and explanations", () => {
  it("returns identical results for identical inputs", () => {
    const a = evaluate(solutionC().input("growth-without-overengineering", { cacheInvalidation: "ttl-cache-aside" }));
    const b = evaluate(solutionC().input("growth-without-overengineering", { cacheInvalidation: "ttl-cache-aside" }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("explains every applied nonzero rule", () => {
    const inputs = [
      solutionA().input("launch-first-saas"),
      solutionB().input("collaborative-workspace"),
      solutionC().input("growth-without-overengineering"),
      ...SCENARIOS.map((s) => ({ scenario: s, ...s.baselineGraph, decisions: s.baselineDecisions })),
    ];
    for (const input of inputs) {
      for (const rule of evaluate(input).rules) {
        if (Object.values(rule.effects).some((n) => n !== 0)) expect(isExplained(rule), rule.id).toBe(true);
      }
    }
  });

  it("explains the delta between two builds", () => {
    const a = evaluate(graph(["ui", "nextjs"], ["host", "vercel"]).link("ui", "host").input("launch-first-saas"));
    const b = evaluate(
      graph(["ui", "nextjs"], ["host", "vercel"], ["db", "supabase"]).link("ui", "host").link("host", "db").input("launch-first-saas"),
    );
    const delta = diffEvaluations(a, b);
    expect(delta.added.map((r) => r.ruleId)).toEqual(expect.arrayContaining(["component-profile", "relational-fit"]));
    expect(delta.scores.developerVelocity).toBeGreaterThan(0);
  });

  it("produces a qualitative cost band only", () => {
    const ev = evaluate(solutionC().input("growth-without-overengineering"));
    expect(["low", "moderate", "high"]).toContain(ev.cost.band);
    expect(ev.cost.unknowns.length).toBeGreaterThan(0);
  });
});

describe("challenges", () => {
  it("baselines are not already complete", () => {
    for (const s of CHALLENGES) {
      expect(checkCompletion({ scenario: s, ...s.baselineGraph, decisions: s.baselineDecisions }).complete, s.id).toBe(false);
    }
  });

  it("A: a lean managed stack completes", () => {
    const res = checkCompletion(solutionA().input("launch-first-saas", { billingWebhooks: "server-verified" }));
    expect(res.checks.filter((c) => !c.ok)).toEqual([]);
    expect(res.complete).toBe(true);
  });

  it("A: adding Redis without a reason prevents completion", () => {
    const g = solutionA();
    g.nodes.push({ id: "cache", componentId: "redis", position: { x: 0, y: 0 } });
    g.link("host", "cache");
    expect(checkCompletion(g.input("launch-first-saas", { billingWebhooks: "server-verified" })).complete).toBe(false);
  });

  it("B: relational data + RLS + bundled storage completes; MongoDB does not", () => {
    expect(checkCompletion(solutionB().input("collaborative-workspace", { authorization: "row-level-security" })).complete).toBe(true);
    const mongo = graph(["ui", "nextjs"], ["host", "vercel"], ["db", "mongodb-atlas"], ["auth", "clerk"], ["files", "s3"])
      .link("ui", "host")
      .link("host", "db")
      .link("ui", "auth")
      .link("host", "files");
    const res = checkCompletion(mongo.input("collaborative-workspace", { authorization: "app-rbac" }));
    expect(res.complete).toBe(false);
  });

  it("C: measure-then-fix completes; optimizing blind does not", () => {
    expect(
      checkCompletion(solutionC().input("growth-without-overengineering", { billingWebhooks: "server-verified", cacheInvalidation: "ttl-cache-aside" }))
        .complete,
    ).toBe(true);
    const blind = solutionC();
    blind.nodes.splice(blind.nodes.findIndex((n) => n.id === "err"), 1);
    blind.edges.splice(blind.edges.findIndex((e) => e.target === "err"), 1);
    const res = checkCompletion(blind.input("growth-without-overengineering", { billingWebhooks: "server-verified", cacheInvalidation: "ttl-cache-aside" }));
    expect(res.complete).toBe(false);
  });

  it("completion ignores user-edited weights", () => {
    const input = solutionA().input("launch-first-saas", { billingWebhooks: "server-verified" });
    const gamed = { ...input, weights: { developerVelocity: 10, costEfficiency: 0, scalability: 0, reliability: 0, performance: 0, simplicity: 0 } };
    expect(checkCompletion(gamed).fit).toBe(checkCompletion(input).fit);
  });

  it("uses default decisions shape", () => {
    expect(Object.keys(DEFAULT_DECISIONS).sort()).toEqual(["authorization", "billingWebhooks", "cacheInvalidation"]);
  });
});
