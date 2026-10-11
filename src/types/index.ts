/**
 * Core domain types for Stackcraft.
 *
 * The catalog (what a component *is*) is kept separate from the user's graph
 * (what the user *built*). Scenario conditions decide which effects apply.
 */

export const DIMENSIONS = [
  "developerVelocity",
  "costEfficiency",
  "scalability",
  "reliability",
  "performance",
  "simplicity",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export type DimensionScores = Record<Dimension, number>;

export type ComponentCategory =
  | "frontend"
  | "hosting"
  | "database"
  | "cache"
  | "storage"
  | "authentication"
  | "billing"
  | "email"
  | "jobs"
  | "analytics"
  | "observability"
  | "search"
  | "workflow"
  | "queue"
  | "security";

/**
 * Capabilities are the generic architectural roles a component fills.
 * Scenarios require capabilities — never vendors — which is how the
 * "workload before vendor" principle is enforced in the engine.
 */
export type Capability =
  | "web-ui"
  | "web-hosting"
  | "server-runtime"
  | "relational-db"
  | "document-db"
  | "key-value-db"
  | "postgres"
  | "cache"
  | "object-storage"
  | "authentication"
  | "billing"
  | "transactional-email"
  | "background-jobs"
  | "message-queue"
  | "product-analytics"
  | "error-monitoring"
  | "logs-uptime"
  | "search"
  | "ci-cd"
  | "bot-protection";

export type ArchitectureComponent = {
  id: string;
  name: string;
  vendor: string;
  category: ComponentCategory;
  /** Generic architectural role, separate from the vendor/product name. */
  role: string;
  summary: string;
  strengths: string[];
  tradeoffs: string[];
  bestFor: string[];
  /** Capabilities this component is primarily added for. */
  provides: Capability[];
  /** Capabilities bundled in, shown as overlap ("also covers"). */
  alsoCovers?: { capability: Capability; note: string }[];
  /** Capabilities that must exist elsewhere in the graph for this to work. */
  dependencies: Capability[];
  /** Categories this component sensibly connects to. */
  compatibleConnections: ComponentCategory[];
  /** Intrinsic profile, applied only when the component fills a real need. */
  dimensionEffects: Partial<Record<Dimension, number>>;
  /** Plain-language reason for the intrinsic profile. */
  effectRationale: string;
  /** "Why this matters" — the underlying engineering idea, vendor-neutral. */
  whyItMatters: string;
  /** True if the service needs a secret key held by a trusted server. */
  needsServerSecret?: boolean;
  /** True if the pricing model is meaningfully usage-based. */
  usageBased: boolean;
  pricingModel: string;
  pricingUrl?: string;
  docsUrl: string;
  lastVerified: string;
  evidenceQuality: "official-docs" | "estimate";
};

/** Conditions describing the workload. Rules read these, not vendor names. */
export type WorkloadSignals = {
  /** Repeated, cacheable reads are a real bottleneck. */
  repeatedReads: boolean;
  /** There is work that should not run inside a user request. */
  asyncWork: boolean;
  /** Multiple organizations/tenants share the system. */
  multiTenant: boolean;
  /** Users upload files. */
  fileUploads: boolean;
  /** Search relevance/typo tolerance is a core feature. */
  searchHeavy: boolean;
  /** Public forms/endpoints are being abused by bots. */
  botAbuse: boolean;
  /** The product charges money now (not a free beta). */
  chargesMoney: boolean;
};

export type SignalKey = keyof WorkloadSignals;

export type Workload = {
  stage: "prototype" | "early" | "growing" | "high-traffic";
  consistency: "high" | "eventual-ok";
  dataShape: "relational" | "flexible" | "document" | "key-value";
  budget: "lean" | "balanced" | "flexible";
  team: "solo" | "small";
  signals: WorkloadSignals;
  /**
   * Signals that are true but only *observable* once monitoring is connected.
   * Models "measure before you optimize".
   */
  hiddenUntilMonitored?: SignalKey[];
};

export type Decisions = {
  /** How access control is enforced after a user is authenticated. */
  authorization: "unspecified" | "row-level-security" | "app-rbac";
  /** How billing events update what a customer is entitled to. */
  billingWebhooks: "unspecified" | "server-verified";
  /** How cached data is kept fresh. */
  cacheInvalidation: "unspecified" | "ttl-cache-aside";
};

export type Requirement =
  | {
      id: string;
      label: string;
      why: string;
      kind: "capability";
      anyOf: Capability[];
    }
  | {
      id: string;
      label: string;
      why: string;
      kind: "decision";
      decision: keyof Decisions;
      notValue: string;
      /** Only enforced when this capability exists in the graph. */
      whenPresent?: Capability;
    };

export type Scenario = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  objective: string;
  isSandbox?: boolean;
  targetWeights: Record<Dimension, number>;
  /** Scenario-specific starting scores before any rules apply. */
  baseline: DimensionScores;
  workload: Workload;
  requirements: Requirement[];
  /** Capabilities that are genuinely helpful (beyond hard requirements). */
  useful: Capability[];
  rubric: string[];
  hints: string[];
  completion: {
    minFit: number;
    /** Rule ids that must NOT be active to complete (e.g. unjustified infra). */
    forbidRules: string[];
    forbidRulePrefixes?: string[];
  };
  debrief: string;
  baselineGraph: { nodes: BuildNode[]; edges: BuildEdge[] };
  baselineDecisions: Decisions;
  reflection?: Reflection;
};

export type Reflection = {
  prompt: string;
  options: { id: string; text: string }[];
  correctId: string;
  explanation: string;
};

export type BuildNode = {
  id: string;
  componentId: string;
  label?: string;
  position: { x: number; y: number };
};

export type BuildEdge = {
  id: string;
  source: string;
  target: string;
};

export type Build = {
  version: 1;
  name: string;
  scenarioId: string;
  nodes: BuildNode[];
  edges: BuildEdge[];
  decisions: Decisions;
  weights?: Record<Dimension, number>;
  /** Only honoured for the sandbox scenario. */
  workload?: Omit<Workload, "hiddenUntilMonitored">;
  savedAt?: string;
};

export type RuleSeverity = "positive" | "neutral" | "warning" | "blocker";

export type RuleResult = {
  /** Stable id, unique per evaluation (may include a node id suffix). */
  id: string;
  /** Rule family id, used for completion criteria and learning XP. */
  ruleId: string;
  title: string;
  effects: Partial<Record<Dimension, number>>;
  /** What happened in the architecture. */
  what: string;
  /** Why the effect applies — the engineering reasoning. */
  why: string;
  /** The trade-off introduced. */
  tradeoff: string;
  /** The scenario condition/assumption that triggered it. */
  trigger: string;
  severity: RuleSeverity;
  nodeIds: string[];
};

export type ConstraintResult = {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  /** Hard requirements block completion; integrity warnings do not. */
  hard: boolean;
};

export type EdgeIssue = {
  edgeId: string;
  kind: "missing-node" | "self-loop" | "duplicate" | "incompatible";
  message: string;
};

export type Evaluation = {
  scores: DimensionScores;
  weightedFit: number;
  rules: RuleResult[];
  constraints: ConstraintResult[];
  edgeIssues: EdgeIssue[];
  blockers: ConstraintResult[];
  strengths: { dimension: Dimension; score: number; evidence: RuleResult[] }[];
  weaknesses: { dimension: Dimension; score: number; evidence: RuleResult[] }[];
  cost: CostBand;
  effectiveSignals: WorkloadSignals;
  hiddenSignals: SignalKey[];
};

export type CostBand = {
  band: "low" | "moderate" | "high";
  drivers: string[];
  unknowns: string[];
};
