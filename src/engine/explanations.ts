import type { Dimension, DimensionScores, Evaluation, RuleResult } from "../types";
import { DIMENSIONS } from "../types";
import { DIMENSION_LABELS } from "./scoring";

export type ScoreDelta = {
  scores: Partial<Record<Dimension, number>>;
  fit: number;
  added: RuleResult[];
  removed: RuleResult[];
  changed: { before: RuleResult; after: RuleResult }[];
};

function sameEffects(a: RuleResult, b: RuleResult) {
  return DIMENSIONS.every((d) => (a.effects[d] ?? 0) === (b.effects[d] ?? 0));
}

/** Explains what changed between two evaluations, rule by rule. */
export function diffEvaluations(prev: Evaluation, next: Evaluation): ScoreDelta {
  const prevById = new Map(prev.rules.map((r) => [r.id, r]));
  const nextById = new Map(next.rules.map((r) => [r.id, r]));
  const added = next.rules.filter((r) => !prevById.has(r.id));
  const removed = prev.rules.filter((r) => !nextById.has(r.id));
  const changed = next.rules
    .filter((r) => prevById.has(r.id) && !sameEffects(prevById.get(r.id)!, r))
    .map((r) => ({ before: prevById.get(r.id)!, after: r }));
  const scores: Partial<Record<Dimension, number>> = {};
  for (const d of DIMENSIONS) {
    const delta = next.scores[d] - prev.scores[d];
    if (delta !== 0) scores[d] = delta;
  }
  return { scores, fit: next.weightedFit - prev.weightedFit, added, removed, changed };
}

export function isEmptyDelta(delta: ScoreDelta) {
  return (
    delta.added.length === 0 &&
    delta.removed.length === 0 &&
    delta.changed.length === 0 &&
    Object.keys(delta.scores).length === 0 &&
    delta.fit === 0
  );
}

export function formatEffects(effects: Partial<Record<Dimension, number>>): string {
  return DIMENSIONS.filter((d) => (effects[d] ?? 0) !== 0)
    .map((d) => `${DIMENSION_LABELS[d]} ${effects[d]! > 0 ? "+" : ""}${effects[d]}`)
    .join(", ");
}

/** Every applied rule with a nonzero effect must be explainable. */
export function isExplained(rule: RuleResult): boolean {
  return [rule.title, rule.what, rule.why, rule.tradeoff, rule.trigger].every((s) => typeof s === "string" && s.trim().length > 0);
}

export function scoreDeltaSummary(prev: DimensionScores, next: DimensionScores): string {
  return DIMENSIONS.filter((d) => next[d] !== prev[d])
    .map((d) => `${DIMENSION_LABELS[d]} ${next[d] - prev[d] > 0 ? "+" : ""}${next[d] - prev[d]}`)
    .join(", ");
}
