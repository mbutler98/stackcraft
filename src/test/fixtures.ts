import { DEFAULT_DECISIONS, getScenario } from "../data/scenarios";
import type { EvaluateInput } from "../engine/scoring";
import type { BuildEdge, BuildNode, Decisions } from "../types";

/** Tiny graph builder for tests: g(["ui","nextjs"], ["host","vercel"]).link("ui","host") */
export function graph(...entries: [id: string, componentId: string][]) {
  const nodes: BuildNode[] = entries.map(([id, componentId], i) => ({ id, componentId, position: { x: i * 100, y: 0 } }));
  const edges: BuildEdge[] = [];
  const api = {
    nodes,
    edges,
    link(a: string, b: string) {
      edges.push({ id: `e-${a}-${b}`, source: a, target: b });
      return api;
    },
    input(scenarioId: string, decisions: Partial<Decisions> = {}, extra: Partial<EvaluateInput> = {}): EvaluateInput {
      return {
        scenario: getScenario(scenarioId),
        nodes,
        edges,
        decisions: { ...DEFAULT_DECISIONS, ...decisions },
        ...extra,
      };
    },
  };
  return api;
}

export function solutionA() {
  return graph(
    ["ui", "nextjs"],
    ["host", "vercel"],
    ["db", "supabase"],
    ["auth", "supabase-auth"],
    ["pay", "stripe-billing"],
    ["err", "sentry"],
  )
    .link("ui", "host")
    .link("host", "db")
    .link("auth", "db")
    .link("ui", "auth")
    .link("host", "pay")
    .link("ui", "err");
}

export function solutionB() {
  return graph(["ui", "nextjs"], ["host", "vercel"], ["db", "supabase"], ["auth", "supabase-auth"], ["err", "sentry"])
    .link("ui", "host")
    .link("host", "db")
    .link("auth", "db")
    .link("ui", "auth")
    .link("ui", "err");
}

export function solutionC() {
  return graph(
    ["ui", "nextjs"],
    ["host", "vercel"],
    ["db", "supabase"],
    ["auth", "supabase-auth"],
    ["pay", "stripe-billing"],
    ["err", "sentry"],
    ["cache", "redis"],
    ["jobs", "trigger-dev"],
  )
    .link("ui", "host")
    .link("host", "db")
    .link("auth", "db")
    .link("ui", "auth")
    .link("host", "pay")
    .link("ui", "err")
    .link("host", "cache")
    .link("host", "jobs");
}
