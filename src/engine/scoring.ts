/**
 * Stackcraft scoring engine.
 *
 * Pure and deterministic: identical inputs always produce identical outputs.
 * Scores are *scenario-fit estimates* for teaching, not benchmarks.
 *
 * Pipeline:
 *   1. Start from the scenario baseline.
 *   2. Validate the graph; only connected components count.
 *   3. Apply each component's intrinsic profile — positives only when it fills a
 *      real need and isn't redundant (so more components ≠ better).
 *   4. Apply architecture/interaction rules that read the workload, decisions and wiring.
 *   5. Evaluate hard requirements separately; failures are blockers.
 */
import { CAPABILITY_LABELS } from "../data/scenarios";
import type {
  Build,
  Capability,
  ConstraintResult,
  CostBand,
  Decisions,
  Dimension,
  DimensionScores,
  Evaluation,
  RuleResult,
  Scenario,
  SignalKey,
  Workload,
  WorkloadSignals,
} from "../types";
import { DIMENSIONS } from "../types";
import {
  activeProviders,
  anyProviders,
  buildGraphContext,
  connectedTo,
  hasActive,
  type GraphContext,
} from "./validation";

export const DIMENSION_LABELS: Record<Dimension, string> = {
  developerVelocity: "Developer velocity",
  costEfficiency: "Cost efficiency",
  scalability: "Scalability",
  reliability: "Reliability",
  performance: "Performance",
  simplicity: "Simplicity",
};

export const DIMENSION_SHORT: Record<Dimension, string> = {
  developerVelocity: "VEL",
  costEfficiency: "CST",
  scalability: "SCL",
  reliability: "REL",
  performance: "PRF",
  simplicity: "SMP",
};

export type EvaluateInput = Pick<Build, "nodes" | "edges" | "decisions" | "weights" | "workload"> & {
  scenario: Scenario;
};

// ────────────────────────────────────────────────────────────────────────────
// Weights

/** Normalizes weights so they sum to 1. Negative weights count as 0; all-zero → equal weights. */
export function normalizeWeights(weights: Record<Dimension, number>): Record<Dimension, number> {
  const clean = Object.fromEntries(
    DIMENSIONS.map((d) => [d, Number.isFinite(weights[d]) && weights[d] > 0 ? weights[d] : 0]),
  ) as Record<Dimension, number>;
  const sum = DIMENSIONS.reduce((acc, d) => acc + clean[d], 0);
  if (sum === 0) return Object.fromEntries(DIMENSIONS.map((d) => [d, 1 / DIMENSIONS.length])) as Record<Dimension, number>;
  return Object.fromEntries(DIMENSIONS.map((d) => [d, clean[d] / sum])) as Record<Dimension, number>;
}

/** weightedFit = Σ weight[d]·score[d] / Σ weight[d], rounded. */
export function weightedFit(scores: DimensionScores, weights: Record<Dimension, number>): number {
  const w = normalizeWeights(weights);
  return Math.round(DIMENSIONS.reduce((acc, d) => acc + w[d] * scores[d], 0));
}

// ────────────────────────────────────────────────────────────────────────────
// Workload

export function resolveWorkload(scenario: Scenario, override?: Build["workload"]): Workload {
  if (scenario.isSandbox && override) {
    return { ...override, signals: { ...override.signals } };
  }
  return scenario.workload;
}

const OBSERVABILITY: Capability[] = ["error-monitoring", "logs-uptime"];

/** Hidden signals stay unknown (treated as false) until monitoring is connected. */
export function effectiveSignals(
  workload: Workload,
  ctx: GraphContext,
): { signals: WorkloadSignals; hidden: SignalKey[]; revealed: SignalKey[] } {
  const monitored = OBSERVABILITY.some((c) => hasActive(ctx, c));
  const hiddenKeys = workload.hiddenUntilMonitored ?? [];
  const signals = { ...workload.signals };
  const hidden: SignalKey[] = [];
  const revealed: SignalKey[] = [];
  for (const key of hiddenKeys) {
    if (monitored) revealed.push(key);
    else {
      hidden.push(key);
      signals[key] = false;
    }
  }
  return { signals, hidden, revealed };
}

function neededCapabilities(scenario: Scenario, signals: WorkloadSignals): Set<Capability> {
  const needed = new Set<Capability>(scenario.useful);
  for (const r of scenario.requirements) if (r.kind === "capability") r.anyOf.forEach((c) => needed.add(c));
  if (signals.repeatedReads) needed.add("cache");
  if (signals.asyncWork) {
    needed.add("background-jobs");
    needed.add("message-queue");
  }
  if (signals.fileUploads) needed.add("object-storage");
  if (signals.searchHeavy) needed.add("search");
  if (signals.botAbuse) needed.add("bot-protection");
  if (signals.chargesMoney) needed.add("billing");
  if (signals.multiTenant) needed.add("authentication");
  return needed;
}

// ────────────────────────────────────────────────────────────────────────────
// Rule helpers

type RuleDraft = Omit<RuleResult, "severity"> & { severity?: RuleResult["severity"] };

function finalize(draft: RuleDraft): RuleResult {
  const values = Object.values(draft.effects).filter((n): n is number => typeof n === "number" && n !== 0);
  const sum = values.reduce((a, b) => a + b, 0);
  const severity = draft.severity ?? (values.length === 0 ? "neutral" : sum > 0 ? "positive" : "warning");
  const effects = Object.fromEntries(
    Object.entries(draft.effects).filter(([, n]) => typeof n === "number" && n !== 0),
  ) as Partial<Record<Dimension, number>>;
  return { ...draft, effects, severity };
}

function names(ctx: GraphContext, ids: string[]): string {
  return ids
    .map((id) => {
      const entry = ctx.knownNodes.find((k) => k.node.id === id);
      return entry?.node.label || entry?.component.name || id;
    })
    .join(", ");
}

function onlyNegative(effects: Partial<Record<Dimension, number>>) {
  return Object.fromEntries(Object.entries(effects).filter(([, n]) => (n ?? 0) < 0)) as Partial<Record<Dimension, number>>;
}

function hasPositive(effects: Partial<Record<Dimension, number>>) {
  return Object.values(effects).some((n) => (n ?? 0) > 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Component profiles

function profileRules(ctx: GraphContext, scenario: Scenario, signals: WorkloadSignals): RuleResult[] {
  const needed = neededCapabilities(scenario, signals);
  const results: RuleResult[] = [];
  /** capability → first active node providing it as a primary capability. */
  const firstPrimary = new Map<Capability, string>();
  for (const { node, component } of ctx.knownNodes) {
    if (!ctx.activeNodeIds.has(node.id)) continue;
    for (const c of component.provides) if (!firstPrimary.has(c)) firstPrimary.set(c, node.id);
  }

  for (const { node, component } of ctx.knownNodes) {
    const label = node.label || component.name;
    if (!ctx.activeNodeIds.has(node.id)) {
      results.push(
        finalize({
          id: `unconnected:${node.id}`,
          ruleId: "unconnected",
          title: `${label} isn't connected`,
          effects: {},
          what: `${label} is on the canvas but has no valid connections.`,
          why: "Scores reflect the architecture you've wired together. An unconnected box isn't doing anything yet.",
          tradeoff: "None yet — connect it to see its effects.",
          trigger: "Graph wiring",
          severity: "warning",
          nodeIds: [node.id],
        }),
      );
      continue;
    }

    const neededHere = component.provides.filter((c) => needed.has(c));
    const firstForNeeded = neededHere.filter((c) => firstPrimary.get(c) === node.id);
    const fillsNeed = firstForNeeded.length > 0;
    const positivesExist = hasPositive(component.dimensionEffects);

    if (fillsNeed || !positivesExist) {
      results.push(
        finalize({
          id: `profile:${node.id}`,
          ruleId: "component-profile",
          title: `${label}: ${component.role.toLowerCase()}`,
          effects: { ...component.dimensionEffects },
          what: `${label} provides ${component.provides.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(" and ")}.`,
          why: component.effectRationale,
          tradeoff: component.tradeoffs[0] ?? "",
          trigger: fillsNeed
            ? `Scenario needs ${firstForNeeded.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(", ")}`
            : "Every added service carries operating cost",
          nodeIds: [node.id],
        }),
      );
      continue;
    }

    // Positive effects withheld: either redundant with another node or not needed.
    const overlapping = component.provides
      .map((c) => firstPrimary.get(c))
      .filter((id): id is string => !!id && id !== node.id);
    const redundant = overlapping.length > 0 && neededHere.length > 0;
    results.push(
      finalize({
        id: `${redundant ? "redundant" : "unneeded"}:${node.id}`,
        ruleId: redundant ? "redundant-component" : "unneeded-component",
        title: redundant ? `${label} overlaps with ${names(ctx, [...new Set(overlapping)])}` : `${label} has no job in this scenario`,
        effects: onlyNegative(component.dimensionEffects),
        what: redundant
          ? `${names(ctx, [...new Set(overlapping)])} already provides ${component.provides.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(", ")}.`
          : `Nothing in this workload needs ${component.provides.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(", ")}.`,
        why: redundant
          ? "A second component for the same job doesn't add the benefit twice — it adds another integration to maintain."
          : "Benefits only count when a component solves a problem the workload actually has.",
        tradeoff: "You keep its costs and complexity without its benefits.",
        trigger: redundant ? "Overlapping capability" : "Workload has no matching need",
        nodeIds: [node.id],
      }),
    );
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Architecture rules

type RuleCtx = {
  ctx: GraphContext;
  scenario: Scenario;
  workload: Workload;
  signals: WorkloadSignals;
  hidden: SignalKey[];
  revealed: SignalKey[];
  decisions: Decisions;
};

type Rule = (r: RuleCtx) => RuleDraft | RuleDraft[] | null;

const ids = (list: { node: { id: string } }[]) => list.map((x) => x.node.id);

const RULES: Rule[] = [
  // Missing dependencies (e.g. a secret-holding service with no server runtime).
  ({ ctx }) => {
    const out: RuleDraft[] = [];
    for (const { node, component } of ctx.knownNodes) {
      if (!ctx.activeNodeIds.has(node.id)) continue;
      const missing = component.dependencies.filter((c) => !hasActive(ctx, c));
      if (missing.length === 0) continue;
      const needsServer = missing.includes("server-runtime");
      out.push({
        id: `dependency-missing:${node.id}`,
        ruleId: "dependency-missing",
        title: `${component.name} is missing ${missing.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(", ")}`,
        effects: { reliability: -8, developerVelocity: -3 },
        what: `${component.name} depends on ${missing.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(", ")}, which isn't connected.`,
        why: needsServer
          ? `${component.name} needs a secret key or trusted verification step. Code shipped to the browser can't keep secrets, so a server or function runtime must do this part.`
          : "A component can't do its job without the things it relies on.",
        tradeoff: "Adding the dependency adds a component, but without it this part of the design doesn't work.",
        trigger: "Component dependency",
        nodeIds: [node.id],
      });
    }
    return out;
  },

  // Next.js on a static host loses server features.
  ({ ctx }) => {
    const out: RuleDraft[] = [];
    for (const { node, component } of ctx.knownNodes) {
      if (component.id !== "nextjs" || !ctx.activeNodeIds.has(node.id)) continue;
      const hostIds = [...(ctx.neighbors.get(node.id) ?? [])];
      const hosts = ctx.knownNodes.filter((k) => hostIds.includes(k.node.id) && k.component.provides.includes("web-hosting"));
      if (hosts.length > 0 && hosts.every((h) => h.component.id === "github-pages")) {
        out.push({
          id: `nextjs-static:${node.id}`,
          ruleId: "nextjs-static-export",
          title: "Next.js on static hosting",
          effects: { developerVelocity: -4, performance: -2 },
          what: "Next.js is hosted only on GitHub Pages.",
          why: "Static hosting needs a static export. Server rendering, route handlers and other server features won't run there.",
          tradeoff: "You keep cheap hosting but carry a framework whose server half you can't use.",
          trigger: "Static host has no server runtime",
          nodeIds: [node.id, ...ids(hosts)],
        });
      }
    }
    return out;
  },

  // Data shape vs database model.
  ({ ctx, workload }) => {
    const relational = activeProviders(ctx, "relational-db");
    const docs = activeProviders(ctx, "document-db");
    const kv = activeProviders(ctx, "key-value-db");
    const out: RuleDraft[] = [];
    if (workload.dataShape === "relational") {
      if (relational.length > 0) {
        out.push({
          id: "relational-fit",
          ruleId: "relational-fit",
          title: "Relational data in a relational database",
          effects: { reliability: 6, developerVelocity: 4 },
          what: `${names(ctx, ids(relational).slice(0, 1))} stores related SaaS entities.`,
          why: "Foreign keys, joins and transactions express \"this belongs to that\" directly, and the database enforces it.",
          tradeoff: "Schema changes need migrations.",
          trigger: "Data shape: relational, consistency: " + workload.consistency,
          nodeIds: ids(relational).slice(0, 1),
        });
      } else if (docs.length + kv.length > 0) {
        out.push({
          id: "nosql-mismatch",
          ruleId: "nosql-mismatch",
          title: "Relational data in a non-relational store",
          effects: { reliability: -8, developerVelocity: -6, simplicity: -3 },
          what: `${names(ctx, ids([...docs, ...kv]))} holds data that is mostly relationships.`,
          why: "Joins, referential integrity and multi-record transactions move into application code, where they're easier to get wrong. An evolving schema alone isn't a reason for NoSQL — PostgreSQL's JSONB handles flexible fields.",
          tradeoff: "You gain flexible documents but lose database-enforced relationships.",
          trigger: "Data shape: relational",
          nodeIds: ids([...docs, ...kv]),
        });
      }
    }
    if (workload.dataShape === "flexible" && relational.length > 0) {
      out.push({
        id: "relational-jsonb",
        ruleId: "relational-jsonb",
        title: "Flexible fields with JSONB",
        effects: { developerVelocity: 2 },
        what: "A relational database stores mostly-structured data with some flexible fields.",
        why: "JSONB columns hold variable attributes while the core stays relational.",
        tradeoff: "JSON fields need care with indexing and validation.",
        trigger: "Data shape: flexible",
        nodeIds: ids(relational).slice(0, 1),
      });
    }
    if (workload.dataShape === "document" && docs.length > 0) {
      out.push({
        id: "document-fit",
        ruleId: "nosql-fit",
        title: "Document data in a document store",
        effects: { developerVelocity: 3, scalability: 4 },
        what: `${names(ctx, ids(docs).slice(0, 1))} stores self-contained documents.`,
        why: "When records are read and written as a unit, documents map directly to the access pattern.",
        tradeoff: "Cross-document relationships still need modeling.",
        trigger: "Data shape: document",
        nodeIds: ids(docs).slice(0, 1),
      });
    }
    if (workload.dataShape === "key-value" && kv.length > 0) {
      out.push({
        id: "kv-fit",
        ruleId: "nosql-fit",
        title: "Known key-based access in a key-value store",
        effects: { scalability: 6, performance: 3 },
        what: `${names(ctx, ids(kv).slice(0, 1))} serves known key lookups.`,
        why: "Designing keys around known access patterns gives predictable performance at scale.",
        tradeoff: "New query patterns may need new indexes or tables.",
        trigger: "Data shape: key-value",
        nodeIds: ids(kv).slice(0, 1),
      });
    }
    return out;
  },

  // Multiple primary databases.
  ({ ctx }) => {
    const dbs = ctx.knownNodes.filter((k) => ctx.activeNodeIds.has(k.node.id) && k.component.category === "database");
    const distinct = new Set(dbs.map((d) => d.component.id));
    if (distinct.size < 2) return null;
    return {
      id: "multiple-databases",
      ruleId: "multiple-databases",
      title: "More than one primary database",
      effects: { simplicity: -8, reliability: -3, costEfficiency: -3 },
      what: `${names(ctx, ids(dbs))} are all acting as databases.`,
      why: "Data split across stores must be kept consistent by your code, and each store has its own backups, limits and failure modes.",
      tradeoff: "Specialised stores can help at scale, but early on they multiply operational work.",
      trigger: "Several database components connected",
      nodeIds: ids(dbs),
    };
  },

  // Authentication vs authorization.
  ({ ctx, signals, decisions }) => {
    const auth = activeProviders(ctx, "authentication");
    const postgres = activeProviders(ctx, "postgres");
    const out: RuleDraft[] = [];
    if (signals.multiTenant && auth.length > 0 && decisions.authorization === "unspecified") {
      out.push({
        id: "authz-missing",
        ruleId: "authz-missing",
        title: "Sign-in without an authorization strategy",
        effects: { reliability: -12 },
        severity: "blocker",
        what: `${names(ctx, ids(auth))} identifies users, but nothing decides which organization's data they can access.`,
        why: "Authentication answers \"who are you?\". In a multi-tenant app, the dangerous bug is answering \"what can you see?\" wrong — one customer reading another's data.",
        tradeoff: "Choosing a strategy adds policy code and tests — worth it.",
        trigger: "Multi-tenant workload with authentication present",
        nodeIds: ids(auth),
      });
    }
    if (decisions.authorization === "row-level-security") {
      if (postgres.length > 0) {
        out.push({
          id: "authz-rls",
          ruleId: "authz-rls",
          title: "Row-level security policies",
          effects: { reliability: 7, simplicity: -2 },
          what: "Access rules are enforced by PostgreSQL row-level security.",
          why: "Policies run inside the database, so every query path — API, dashboard, script — is filtered the same way.",
          tradeoff: "Policies are easy to get subtly wrong; they need dedicated tests.",
          trigger: "Decision: row-level security on PostgreSQL",
          nodeIds: ids(postgres).slice(0, 1),
        });
      } else {
        out.push({
          id: "authz-rls-invalid",
          ruleId: "authz-rls-invalid",
          title: "Row-level security without PostgreSQL",
          effects: { reliability: -4 },
          what: "Row-level security was chosen, but no PostgreSQL database is connected.",
          why: "Row-level security is a PostgreSQL feature. Other stores need application-level checks.",
          tradeoff: "Pick a Postgres database or switch to application RBAC.",
          trigger: "Decision conflicts with database choice",
          nodeIds: [],
        });
      }
    }
    if (decisions.authorization === "app-rbac" && auth.length > 0) {
      out.push({
        id: "authz-rbac",
        ruleId: "authz-rbac",
        title: "Application-level role checks",
        effects: { reliability: 5, developerVelocity: -2 },
        what: "Access rules are enforced in server code by checking roles and membership.",
        why: "Explicit checks in a central place keep tenant boundaries clear and work with any database.",
        tradeoff: "Every new query path must remember to call the check.",
        trigger: "Decision: application RBAC",
        nodeIds: ids(auth),
      });
    }
    return out;
  },

  // Billing webhooks and entitlements.
  ({ ctx, signals, decisions }) => {
    const billing = activeProviders(ctx, "billing");
    if (billing.length === 0) return null;
    const out: RuleDraft[] = [];
    if (decisions.billingWebhooks === "unspecified") {
      out.push({
        id: "billing-unverified",
        ruleId: "billing-unverified",
        title: "No plan for billing webhooks",
        effects: { reliability: -5 },
        what: "Payments are processed, but nothing updates what customers are entitled to.",
        why: "If entitlements don't follow verified payment events, people keep access after cancelling — or lose it after paying.",
        tradeoff: "Handling webhooks means server code, signature checks and idempotency.",
        trigger: "Billing present, webhook decision unspecified",
        nodeIds: ids(billing),
      });
    } else if (hasActive(ctx, "server-runtime")) {
      out.push({
        id: "billing-verified",
        ruleId: "billing-verified",
        title: "Webhooks verified on a server",
        effects: { reliability: 5 },
        what: "Billing events are verified server-side and update entitlements.",
        why: "Signature verification proves events are genuine; idempotent handlers make retries safe.",
        tradeoff: "More server code to own and test.",
        trigger: "Decision: server-verified webhooks",
        nodeIds: ids(billing),
      });
    }
    if (!signals.chargesMoney) {
      out.push({
        id: "billing-premature",
        ruleId: "billing-premature",
        title: "Billing before charging",
        effects: { simplicity: -2 },
        what: "Billing is wired up, but the workload isn't charging money yet.",
        why: "Integrating payments early is fine, but it's code and configuration that isn't earning anything yet.",
        tradeoff: "Earlier integration vs. a leaner build.",
        trigger: "Workload: not charging money",
        nodeIds: ids(billing),
      });
    }
    return out;
  },

  // Caching.
  ({ ctx, signals, hidden, decisions }) => {
    const caches = activeProviders(ctx, "cache");
    const out: RuleDraft[] = [];
    if (caches.length === 0) {
      if (signals.repeatedReads) {
        out.push({
          id: "read-bottleneck-unaddressed",
          ruleId: "read-bottleneck-unaddressed",
          title: "Repeated-read bottleneck unaddressed",
          effects: { performance: -8, scalability: -5 },
          what: "Monitoring shows the same reads hitting the database repeatedly.",
          why: "Every repeated read costs a database round trip. A cache is one fix; query tuning or read replicas are others.",
          tradeoff: "Doing nothing is simplest, but users feel the slowness.",
          trigger: "Workload: repeated reads are a bottleneck",
          nodeIds: [],
        });
      }
      return out;
    }
    const cacheIds = ids(caches);
    const inPath = caches.some(({ node }) => connectedTo(ctx, node.id, "server-runtime") || connectedTo(ctx, node.id, "relational-db"));
    if (hidden.includes("repeatedReads")) {
      out.push({
        id: "cache-unmeasured",
        ruleId: "cache-unmeasured",
        title: "Cache added before measuring",
        effects: { simplicity: -2 },
        what: "A cache was added, but nothing has shown which reads are slow.",
        why: "Without measurement you can't know what to cache, how long it may stay stale, or whether reads are even the bottleneck.",
        tradeoff: "Speculative infrastructure: cost and invalidation risk with unknown benefit.",
        trigger: "Repeated reads: unknown (no monitoring connected)",
        nodeIds: cacheIds,
      });
      return out;
    }
    if (!signals.repeatedReads) {
      out.push({
        id: "cache-unjustified",
        ruleId: "cache-unjustified",
        title: "Cache without a read bottleneck",
        effects: { simplicity: -2, reliability: -1 },
        what: "A cache sits in the architecture, but reads aren't a bottleneck.",
        why: "A cache only helps when the same data is read repeatedly and that load is a problem. Otherwise it's another service plus a stale-data risk.",
        tradeoff: "No performance gain; extra cost, operations and invalidation bugs.",
        trigger: "Workload: no repeated-read bottleneck",
        nodeIds: cacheIds,
      });
      return out;
    }
    if (!inPath) {
      out.push({
        id: "cache-off-path",
        ruleId: "cache-off-path",
        title: "Cache isn't in the read path",
        effects: {},
        what: "The cache isn't connected to the server or database that serves the slow reads.",
        why: "A cache helps only where requests can check it before hitting the database.",
        tradeoff: "Connect it to your server runtime or database.",
        trigger: "Graph wiring",
        nodeIds: cacheIds,
        severity: "warning",
      });
      return out;
    }
    out.push({
      id: "cache-justified",
      ruleId: "cache-justified",
      title: "Cache absorbs repeated reads",
      effects: { performance: 14, scalability: 8 },
      what: "Hot, repeated reads are served from memory instead of the database.",
      why: "When the same data is requested again and again, serving it from memory cuts latency and database load.",
      tradeoff: "Data may be stale until invalidated or expired.",
      trigger: "Workload: repeated reads are a measured bottleneck",
      nodeIds: cacheIds,
    });
    if (decisions.cacheInvalidation === "unspecified") {
      out.push({
        id: "cache-no-invalidation",
        ruleId: "cache-no-invalidation",
        title: "No cache freshness plan",
        effects: { reliability: -5 },
        what: "Nothing defines when cached data expires or is refreshed.",
        why: "Without TTLs or invalidation, users eventually see outdated data — and it's hard to debug.",
        tradeoff: "Pick a strategy (e.g. cache-aside with a TTL) in Decisions.",
        trigger: "Cache present, invalidation unspecified",
        nodeIds: cacheIds,
      });
    } else {
      out.push({
        id: "cache-ttl",
        ruleId: "cache-ttl",
        title: "Cache-aside with expiry",
        effects: { reliability: 2 },
        what: "Reads check the cache, fall back to the database, and entries expire after a TTL.",
        why: "A bounded staleness window is predictable and easy to reason about.",
        tradeoff: "Data can be up to one TTL old.",
        trigger: "Decision: cache-aside with TTL",
        nodeIds: cacheIds,
      });
    }
    return out;
  },

  // Asynchronous work.
  ({ ctx, signals, hidden }) => {
    const jobs = activeProviders(ctx, "background-jobs");
    const queues = activeProviders(ctx, "message-queue");
    const all = [...jobs, ...queues];
    const out: RuleDraft[] = [];
    if (jobs.length > 0 && queues.length > 0) {
      out.push({
        id: "async-overlap",
        ruleId: "async-overlap",
        title: "Two async systems",
        effects: { simplicity: -3 },
        what: `${names(ctx, ids(all))} both handle asynchronous work.`,
        why: "One async mechanism is usually enough early on; two means two retry models and two places to debug.",
        tradeoff: "Specialization vs. one fewer system.",
        trigger: "Overlapping capability",
        nodeIds: ids(all),
      });
    }
    if (all.length === 0) {
      if (signals.asyncWork) {
        out.push({
          id: "async-unaddressed",
          ruleId: "async-unaddressed",
          title: "Slow work runs inside requests",
          effects: { performance: -6, reliability: -6 },
          what: "Long-running tasks (like exports) run while the user waits.",
          why: "Requests have time limits. Slow work in the request path causes timeouts and has no automatic retry.",
          tradeoff: "Keeping it synchronous is simpler but fragile.",
          trigger: "Workload: slow or retryable work exists",
          nodeIds: [],
        });
      }
      return out;
    }
    if (hidden.includes("asyncWork")) {
      out.push({
        id: "async-unmeasured",
        ruleId: "async-unmeasured",
        title: "Async infrastructure before measuring",
        effects: { simplicity: -2 },
        what: "A job/queue service was added before identifying which work is slow.",
        why: "Without measurement you don't know which tasks belong in the background.",
        tradeoff: "Another service with unknown benefit.",
        trigger: "Slow work: unknown (no monitoring connected)",
        nodeIds: ids(all),
      });
      return out;
    }
    if (!signals.asyncWork) {
      out.push({
        id: "async-unjustified",
        ruleId: "async-unjustified",
        title: "Async infrastructure without async work",
        effects: { simplicity: -3 },
        what: `${names(ctx, ids(all))} is in the architecture, but no work needs to leave the request.`,
        why: "Queues and job runners help with slow, scheduled or retryable work — not every request.",
        tradeoff: "Delivery semantics, idempotency and another dashboard for no current benefit.",
        trigger: "Workload: no slow or retryable work",
        nodeIds: ids(all),
      });
      return out;
    }
    out.push({
      id: "async-justified",
      ruleId: "async-justified",
      title: "Slow work moved to the background",
      effects: { reliability: 8, performance: 6 },
      what: "Long-running tasks run as background jobs with retries.",
      why: "Requests return quickly, and failed work is retried instead of lost.",
      tradeoff: "Results arrive later; handlers must be idempotent.",
      trigger: "Workload: slow or retryable work exists",
      nodeIds: ids(all),
    });
    return out;
  },

  // Search.
  ({ ctx, signals }) => {
    const search = activeProviders(ctx, "search");
    if (search.length === 0) return null;
    if (signals.searchHeavy) {
      return {
        id: "search-justified",
        ruleId: "search-justified",
        title: "Dedicated search for a search-centric product",
        effects: { performance: 6, developerVelocity: 3 },
        what: "A hosted index serves search with relevance tuning and typo tolerance.",
        why: "When search quality is the product, a dedicated engine beats hand-tuning database queries.",
        tradeoff: "Index sync pipeline and duplicated data.",
        trigger: "Workload: search is a core feature",
        nodeIds: ids(search),
      };
    }
    return {
      id: "search-unjustified",
      ruleId: "search-unjustified",
      title: "Search index without a search problem",
      effects: { simplicity: -2 },
      what: "A hosted search index is connected, but search isn't a core need.",
      why: "Database search (e.g. PostgreSQL full-text) is usually enough early on, without syncing a second copy of your data.",
      tradeoff: "Sync pipeline, permission mirroring and cost for little gain.",
      trigger: "Workload: search isn't central",
      nodeIds: ids(search),
    };
  },

  // Bot protection.
  ({ ctx, signals }) => {
    const bots = activeProviders(ctx, "bot-protection");
    if (bots.length === 0) return null;
    if (signals.botAbuse) {
      return {
        id: "bot-justified",
        ruleId: "bot-justified",
        title: "Bot protection on abused forms",
        effects: { reliability: 5 },
        what: "Public forms are protected by a challenge verified server-side.",
        why: "Filtering automated traffic protects sign-up quality and downstream systems like email.",
        tradeoff: "Doesn't replace rate limits, auth or authorization.",
        trigger: "Workload: bots abuse public forms",
        nodeIds: ids(bots),
      };
    }
    return {
      id: "bot-unjustified",
      ruleId: "bot-unjustified",
      title: "Bot protection without bot abuse",
      effects: { developerVelocity: -1 },
      what: "A bot challenge guards forms that aren't being abused.",
      why: "It's cheap, but it's still an integration and a small user-facing step.",
      tradeoff: "Prevention before there's a problem.",
      trigger: "Workload: no bot abuse",
      nodeIds: ids(bots),
    };
  },

  // Monitoring.
  ({ ctx, workload, revealed }) => {
    const errors = activeProviders(ctx, "error-monitoring");
    const logs = activeProviders(ctx, "logs-uptime");
    const out: RuleDraft[] = [];
    if (errors.length > 0) {
      out.push({
        id: "monitoring-errors",
        ruleId: "monitoring-errors",
        title: "Errors are visible",
        effects: { reliability: 8 },
        what: `${names(ctx, ids(errors).slice(0, 1))} reports exceptions with context.`,
        why: "Faster detection and diagnosis shortens how long users are affected. It doesn't prevent failures or guarantee uptime.",
        tradeoff: "Event quotas and sensitive-data scrubbing.",
        trigger: "Error monitoring connected",
        nodeIds: ids(errors).slice(0, 1),
      });
    }
    if (logs.length > 0) {
      out.push({
        id: "monitoring-logs",
        ruleId: "monitoring-logs",
        title: "Logs and uptime checks",
        effects: { reliability: 5 },
        what: `${names(ctx, ids(logs).slice(0, 1))} collects logs and checks availability.`,
        why: "You learn about downtime from a check, not a customer, and can search logs to find patterns.",
        tradeoff: "Ingestion cost and alert noise.",
        trigger: "Logs/uptime monitoring connected",
        nodeIds: ids(logs).slice(0, 1),
      });
    }
    if (revealed.length > 0) {
      out.push({
        id: "monitoring-revealed",
        ruleId: "monitoring-revealed",
        title: "Monitoring revealed bottlenecks",
        effects: {},
        severity: "neutral",
        what: `Now visible: ${revealed.map((k) => (k === "repeatedReads" ? "repeated reads on hot pages" : "slow exports timing out")).join("; ")}.`,
        why: "Measurement turns vague complaints into specific, fixable problems.",
        tradeoff: "None — this is the point of measuring first.",
        trigger: "Monitoring connected",
        nodeIds: ids([...errors, ...logs]),
      });
    }
    if (errors.length + logs.length === 0 && (workload.stage === "growing" || workload.stage === "high-traffic")) {
      out.push({
        id: "monitoring-missing",
        ruleId: "monitoring-missing",
        title: "Growing without monitoring",
        effects: { reliability: -8 },
        what: "Traffic is growing and nothing reports errors or slow requests.",
        why: "Without measurement, every optimization is a guess.",
        tradeoff: "Adding monitoring costs a little; flying blind costs more.",
        trigger: "Stage: " + workload.stage,
        nodeIds: [],
      });
    }
    return out;
  },

  // Serverless/edge compute talking to a conventional managed database.
  ({ ctx }) => {
    const out: RuleDraft[] = [];
    for (const { node, component } of ctx.knownNodes) {
      if (!ctx.activeNodeIds.has(node.id)) continue;
      if (component.id !== "vercel" && component.id !== "cloudflare-workers") continue;
      const rdsNeighbors = ctx.knownNodes.filter(
        (k) => k.component.id === "rds" && ctx.neighbors.get(node.id)?.has(k.node.id),
      );
      if (rdsNeighbors.length === 0) continue;
      out.push({
        id: `serverless-connections:${node.id}`,
        ruleId: "serverless-connections",
        title: "Serverless fan-out to a connection-limited database",
        effects: component.id === "cloudflare-workers" ? { scalability: -4, performance: -4 } : { scalability: -4 },
        what: `${component.name} connects directly to Amazon RDS.`,
        why:
          component.id === "cloudflare-workers"
            ? "Edge handlers run far from a single-region database and each may open connections. Use a connection pooler and keep data access close."
            : "Many short-lived function instances can exhaust database connections. A pooler (such as RDS Proxy) is typically needed.",
        tradeoff: "Pooling adds a component; skipping it risks connection errors under load.",
        trigger: "Serverless runtime + instance-based database",
        nodeIds: [node.id, ...ids(rdsNeighbors)],
      });
    }
    return out;
  },

  // Overlapping bundled capabilities (e.g. Supabase Storage + S3).
  ({ ctx }) => {
    const out: RuleDraft[] = [];
    const s3 = activeProviders(ctx, "object-storage").filter((k) => k.component.provides.includes("object-storage"));
    const bundled = ctx.knownNodes.filter(
      (k) => ctx.activeNodeIds.has(k.node.id) && (k.component.alsoCovers ?? []).some((c) => c.capability === "object-storage"),
    );
    if (s3.length > 0 && bundled.length > 0) {
      out.push({
        id: "bundled-overlap-storage",
        ruleId: "bundled-overlap",
        title: "Object storage is already bundled",
        effects: { simplicity: -2 },
        severity: "neutral",
        what: `${names(ctx, ids(bundled))} includes file storage, and ${names(ctx, ids(s3))} is also connected.`,
        why: "Using a bundled feature avoids another vendor; a separate store can make sense for specific needs (existing AWS setup, lifecycle rules).",
        tradeoff: "One more vendor and permission model.",
        trigger: "Overlapping capability",
        nodeIds: [...ids(bundled), ...ids(s3)],
      });
    }
    return out;
  },

  // Vendor sprawl for small teams.
  ({ ctx, workload }) => {
    const vendors = new Set(
      ctx.knownNodes.filter((k) => ctx.activeNodeIds.has(k.node.id)).map((k) => k.component.vendor),
    );
    const allowance = workload.team === "solo" ? 5 : 7;
    const extra = vendors.size - allowance;
    if (extra <= 0) return null;
    return {
      id: "integration-surface",
      ruleId: "integration-surface",
      title: `${vendors.size} vendors for a ${workload.team === "solo" ? "solo developer" : "small team"}`,
      effects: { simplicity: -2 * extra, developerVelocity: -extra },
      what: `The architecture spans ${vendors.size} vendors.`,
      why: "Each vendor is another dashboard, bill, set of credentials, outage to track and SDK to upgrade.",
      tradeoff: "Specialist tools vs. fewer things to manage.",
      trigger: `Team: ${workload.team}`,
      nodeIds: [],
    };
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Constraints

function evaluateConstraints(
  ctx: GraphContext,
  scenario: Scenario,
  decisions: Decisions,
  signals: WorkloadSignals,
): ConstraintResult[] {
  const out: ConstraintResult[] = [];
  for (const req of scenario.requirements) {
    if (req.kind === "capability") {
      const active = req.anyOf.some((c) => hasActive(ctx, c));
      const onCanvas = req.anyOf.some((c) => anyProviders(ctx, c).length > 0);
      out.push({
        id: `req:${req.id}`,
        label: req.label,
        hard: true,
        status: active ? "pass" : "fail",
        detail: active
          ? req.why
          : onCanvas
            ? `On the canvas but not connected. ${req.why}`
            : `Missing: ${req.anyOf.map((c) => CAPABILITY_LABELS[c]).join(" or ")}. ${req.why}`,
      });
    } else {
      if (req.whenPresent && !hasActive(ctx, req.whenPresent)) {
        out.push({ id: `req:${req.id}`, label: req.label, hard: true, status: "pass", detail: "Not applicable yet." });
        continue;
      }
      const ok = decisions[req.decision] !== req.notValue;
      out.push({
        id: `req:${req.id}`,
        label: req.label,
        hard: true,
        status: ok ? "pass" : "fail",
        detail: ok ? req.why : `Choose one in the Decisions panel. ${req.why}`,
      });
    }
  }

  // Integrity checks (warnings, not challenge blockers).
  if (signals.multiTenant && !scenario.requirements.some((r) => r.kind === "decision" && r.decision === "authorization")) {
    if (hasActive(ctx, "authentication") && decisions.authorization === "unspecified") {
      out.push({
        id: "integrity:authz",
        label: "Authorization strategy",
        hard: false,
        status: "warn",
        detail: "Multi-tenant app with sign-in but no authorization strategy.",
      });
    }
  }
  for (const { node, component } of ctx.knownNodes) {
    if (!ctx.activeNodeIds.has(node.id)) continue;
    const missing = component.dependencies.filter((c) => !hasActive(ctx, c));
    if (missing.length > 0) {
      out.push({
        id: `integrity:dep:${node.id}`,
        label: `${component.name} dependencies`,
        hard: false,
        status: "warn",
        detail: `Needs ${missing.map((c) => CAPABILITY_LABELS[c].toLowerCase()).join(", ")}.`,
      });
    }
  }
  if (ctx.edgeIssues.length > 0) {
    out.push({
      id: "integrity:edges",
      label: "Connections",
      hard: false,
      status: "warn",
      detail: `${ctx.edgeIssues.length} connection${ctx.edgeIssues.length === 1 ? " is" : "s are"} invalid and ignored.`,
    });
  }
  if (ctx.unknownNodes.length > 0) {
    out.push({
      id: "integrity:unknown",
      label: "Unknown components",
      hard: false,
      status: "warn",
      detail: `${ctx.unknownNodes.length} component(s) aren't in the catalog and are ignored.`,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost band (qualitative only)

function costBand(ctx: GraphContext): CostBand {
  const active = ctx.knownNodes.filter((k) => ctx.activeNodeIds.has(k.node.id));
  const usage = [...new Map(active.filter((k) => k.component.usageBased).map((k) => [k.component.id, k.component])).values()];
  const heavy = usage.filter((c) => ["rds", "dynamodb", "algolia", "mongodb-atlas"].includes(c.id));
  const points = usage.length + heavy.length;
  const band: CostBand["band"] = points <= 3 ? "low" : points <= 7 ? "moderate" : "high";
  return {
    band,
    drivers: usage.map((c) => `${c.name}: ${c.pricingModel.split(".")[0]}`),
    unknowns: [
      "Traffic and request volume",
      "Data stored and transferred",
      "Plan tiers and included allowances",
      "Region, redundancy and backup settings",
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Evaluate

export function evaluate(input: EvaluateInput): Evaluation {
  const { scenario, nodes, edges } = input;
  const decisions = input.decisions;
  const weights = input.weights ?? scenario.targetWeights;
  const workload = resolveWorkload(scenario, input.workload);
  const ctx = buildGraphContext(nodes, edges);
  const { signals, hidden, revealed } = effectiveSignals(workload, ctx);

  const rules: RuleResult[] = [...profileRules(ctx, scenario, signals)];
  const rctx: RuleCtx = { ctx, scenario, workload, signals, hidden, revealed, decisions };
  for (const rule of RULES) {
    const res = rule(rctx);
    if (!res) continue;
    for (const draft of Array.isArray(res) ? res : [res]) rules.push(finalize(draft));
  }

  // Budget sensitivity amplifies cost penalties already incurred.
  const factor = workload.budget === "lean" ? 0.3 : workload.budget === "balanced" ? 0.1 : 0;
  const costPenalty = rules.reduce((acc, r) => acc + Math.min(0, r.effects.costEfficiency ?? 0), 0);
  const extra = Math.round(costPenalty * factor);
  if (extra < 0) {
    rules.push(
      finalize({
        id: "budget-sensitivity",
        ruleId: "budget-sensitivity",
        title: `${workload.budget === "lean" ? "Lean" : "Balanced"} budget amplifies costs`,
        effects: { costEfficiency: extra },
        what: "Usage-based and paid services weigh more heavily on this budget.",
        why: "The same bill matters more when money is tight; every paid service competes for runway.",
        tradeoff: "Free tiers help early, but plan limits arrive with growth.",
        trigger: `Budget: ${workload.budget}`,
        nodeIds: [],
      }),
    );
  }

  const scores = { ...scenario.baseline };
  for (const r of rules) {
    for (const d of DIMENSIONS) scores[d] += r.effects[d] ?? 0;
  }
  for (const d of DIMENSIONS) scores[d] = Math.max(0, Math.min(100, Math.round(scores[d])));

  const constraints = evaluateConstraints(ctx, scenario, decisions, signals);
  const blockers = constraints.filter((c) => c.hard && c.status === "fail");

  const evidenceFor = (d: Dimension, sign: 1 | -1) =>
    rules
      .filter((r) => (r.effects[d] ?? 0) * sign > 0)
      .sort((a, b) => Math.abs(b.effects[d] ?? 0) - Math.abs(a.effects[d] ?? 0) || a.id.localeCompare(b.id))
      .slice(0, 2);
  const ranked = [...DIMENSIONS].sort((a, b) => scores[b] - scores[a] || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b));

  return {
    scores,
    weightedFit: weightedFit(scores, weights),
    rules,
    constraints,
    edgeIssues: ctx.edgeIssues,
    blockers,
    strengths: ranked.slice(0, 3).map((d) => ({ dimension: d, score: scores[d], evidence: evidenceFor(d, 1) })),
    weaknesses: ranked
      .slice(-3)
      .reverse()
      .map((d) => ({ dimension: d, score: scores[d], evidence: evidenceFor(d, -1) })),
    cost: costBand(ctx),
    effectiveSignals: signals,
    hiddenSignals: hidden,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Challenge completion

export type CompletionResult = {
  complete: boolean;
  fit: number;
  checks: { label: string; ok: boolean; detail: string }[];
};

/** Completion is judged with the challenge's own priorities, not user-edited weights. */
export function checkCompletion(input: EvaluateInput): CompletionResult {
  const { scenario } = input;
  const evaluation = evaluate({ ...input, weights: scenario.targetWeights });
  const forbidden = evaluation.rules.filter(
    (r) =>
      scenario.completion.forbidRules.includes(r.ruleId) ||
      (scenario.completion.forbidRulePrefixes ?? []).some((p) => r.ruleId.startsWith(p)),
  );
  const unconnected = evaluation.rules.filter((r) => r.ruleId === "unconnected");
  const deps = evaluation.rules.filter((r) => r.ruleId === "dependency-missing");
  const checks = [
    {
      label: "All hard requirements met",
      ok: evaluation.blockers.length === 0,
      detail:
        evaluation.blockers.length === 0
          ? "Every requirement is covered by a connected component or decision."
          : evaluation.blockers.map((b) => b.label).join(", "),
    },
    {
      label: "No unjustified or risky patterns",
      ok: forbidden.length === 0,
      detail: forbidden.length === 0 ? "Each component earns its place." : forbidden.map((r) => r.title).join("; "),
    },
    {
      label: "Every component works",
      ok: deps.length === 0 && unconnected.length === 0,
      detail:
        deps.length + unconnected.length === 0
          ? "Dependencies satisfied and everything is connected."
          : [...deps, ...unconnected].map((r) => r.title).join("; "),
    },
    {
      label: `Scenario fit ≥ ${scenario.completion.minFit}`,
      ok: evaluation.weightedFit >= scenario.completion.minFit,
      detail: `Current fit with challenge priorities: ${evaluation.weightedFit}.`,
    },
  ];
  return {
    complete: !scenario.isSandbox && checks.every((c) => c.ok),
    fit: evaluation.weightedFit,
    checks,
  };
}

/** A playful but deterministic "class" for the build, RPG-style. */
export function archetype(evaluation: Evaluation, nodeCount: number): { name: string; blurb: string } {
  const s = evaluation.scores;
  if (nodeCount === 0) return { name: "Blank Slate", blurb: "Every architecture starts here." };
  if (evaluation.blockers.length > 0 && nodeCount <= 2)
    return { name: "Apprentice Stack", blurb: "Core needs are still missing." };
  if (s.simplicity < 40 && nodeCount >= 8) return { name: "Overbuilt Fortress", blurb: "Strong walls, heavy upkeep." };
  if (s.performance >= 70 && s.scalability >= 65) return { name: "Scale Sprinter", blurb: "Fast under load, by design." };
  if (s.reliability >= 70 && s.simplicity >= 55) return { name: "Steady Guardian", blurb: "Correct, observable, calm." };
  if (s.developerVelocity >= 70 && s.simplicity >= 60) return { name: "Lean Launcher", blurb: "Ships fast with few moving parts." };
  if (s.costEfficiency >= 65) return { name: "Thrifty Builder", blurb: "Spends where it counts." };
  return { name: "Journeyman Stack", blurb: "Balanced, with room to specialise." };
}
