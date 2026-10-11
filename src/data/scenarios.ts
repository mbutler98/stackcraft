import type { Capability, Decisions, Dimension, Scenario, SignalKey, WorkloadSignals } from "../types";

export const DEFAULT_DECISIONS: Decisions = {
  authorization: "unspecified",
  billingWebhooks: "unspecified",
  cacheInvalidation: "unspecified",
};

const NO_SIGNALS: WorkloadSignals = {
  repeatedReads: false,
  asyncWork: false,
  multiTenant: false,
  fileUploads: false,
  searchHeavy: false,
  botAbuse: false,
  chargesMoney: false,
};

export const SIGNAL_LABELS: Record<SignalKey, { label: string; detail: string }> = {
  repeatedReads: {
    label: "Repeated reads are a bottleneck",
    detail: "The same data is read over and over and it is measurably slowing things down.",
  },
  asyncWork: {
    label: "Slow or retryable work exists",
    detail: "Some tasks (exports, imports, emails, AI calls) take too long for a user request.",
  },
  multiTenant: {
    label: "Multiple organizations share the app",
    detail: "Users belong to orgs, and one org must never see another's data.",
  },
  fileUploads: {
    label: "Users upload files",
    detail: "Documents, images or attachments must be stored and served.",
  },
  searchHeavy: {
    label: "Search is a core feature",
    detail: "Relevance and typo tolerance matter beyond what database search provides.",
  },
  botAbuse: {
    label: "Bots abuse public forms",
    detail: "Sign-up or contact forms are being hit by automated traffic.",
  },
  chargesMoney: {
    label: "The product charges money",
    detail: "Paid subscriptions are live (not a free beta).",
  },
};

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "web-ui": "Web UI",
  "web-hosting": "Web hosting",
  "server-runtime": "Server runtime (holds secrets)",
  "relational-db": "Relational database",
  "document-db": "Document database",
  "key-value-db": "Key-value database",
  postgres: "PostgreSQL",
  cache: "Cache",
  "object-storage": "Object storage",
  authentication: "Authentication",
  billing: "Billing",
  "transactional-email": "Transactional email",
  "background-jobs": "Background jobs",
  "message-queue": "Message queue",
  "product-analytics": "Product analytics",
  "error-monitoring": "Error monitoring",
  "logs-uptime": "Logs & uptime",
  search: "Search index",
  "ci-cd": "CI/CD",
  "bot-protection": "Bot protection",
};

const weights = (w: Record<Dimension, number>) => w;

export const SCENARIOS: Scenario[] = [
  {
    id: "launch-first-saas",
    kicker: "Challenge A",
    title: "Launch your first SaaS",
    description:
      "You're a solo developer launching a paid SaaS on a lean budget. You need a web app, persistent data, sign-in, subscriptions and enough visibility to know when something breaks.",
    objective:
      "Ship a complete, paid MVP with the fewest moving parts. Every component should earn its place.",
    targetWeights: weights({
      developerVelocity: 3,
      simplicity: 3,
      costEfficiency: 2,
      reliability: 1,
      scalability: 0.5,
      performance: 0.5,
    }),
    baseline: {
      developerVelocity: 45,
      costEfficiency: 60,
      scalability: 50,
      reliability: 45,
      performance: 50,
      simplicity: 60,
    },
    workload: {
      stage: "early",
      consistency: "high",
      dataShape: "relational",
      budget: "lean",
      team: "solo",
      signals: { ...NO_SIGNALS, chargesMoney: true },
    },
    requirements: [
      { id: "ui", kind: "capability", anyOf: ["web-ui"], label: "A web UI", why: "Customers need something to use." },
      { id: "host", kind: "capability", anyOf: ["web-hosting"], label: "Somewhere to host it", why: "The UI must be served to browsers." },
      {
        id: "data",
        kind: "capability",
        anyOf: ["relational-db", "document-db", "key-value-db"],
        label: "Persistent data",
        why: "Accounts and app data must survive restarts.",
      },
      { id: "auth", kind: "capability", anyOf: ["authentication"], label: "User sign-in", why: "Paid accounts need identity." },
      { id: "billing", kind: "capability", anyOf: ["billing"], label: "Subscriptions", why: "The product charges money from day one." },
      {
        id: "webhooks",
        kind: "decision",
        decision: "billingWebhooks",
        notValue: "unspecified",
        whenPresent: "billing",
        label: "Billing webhooks verified on a server",
        why: "Entitlements must follow real payment events, verified with a secret.",
      },
      {
        id: "errors",
        kind: "capability",
        anyOf: ["error-monitoring", "logs-uptime"],
        label: "Basic error visibility",
        why: "You need to know when paying customers hit errors.",
      },
    ],
    useful: ["ci-cd", "product-analytics", "transactional-email", "server-runtime"],
    rubric: [
      "All needs covered by connected components",
      "No cache, queue or search index without a workload reason",
      "Billing events update entitlements on a trusted server",
      "Scenario fit of 62 or more, judged with the challenge's priorities",
    ],
    hints: [
      "A managed platform that bundles a database and auth can cover several needs with one vendor.",
      "Payments need a server to hold the secret key and verify webhooks. Static hosting can't do that.",
      "Nothing in this scenario says reads are slow. What would a cache buy you?",
    ],
    completion: {
      minFit: 62,
      forbidRules: ["cache-unjustified", "async-unjustified", "search-unjustified", "multiple-databases", "integration-surface"],
    },
    debrief:
      "Early on, your scarcest resource is your own time. Managed services trade money and some lock-in for fewer things to operate — a good trade when you're one person. The components you didn't add matter as much as the ones you did: every service is another bill, dashboard, set of keys and failure mode.",
    baselineGraph: {
      nodes: [
        { id: "a-ui", componentId: "nextjs", position: { x: 80, y: 120 } },
        { id: "a-host", componentId: "vercel", position: { x: 380, y: 120 } },
      ],
      edges: [{ id: "a-e1", source: "a-ui", target: "a-host" }],
    },
    baselineDecisions: { ...DEFAULT_DECISIONS },
    reflection: {
      prompt: "Why wouldn't adding Redis improve this MVP's score?",
      options: [
        { id: "a", text: "Redis is slow compared to PostgreSQL." },
        { id: "b", text: "Nothing shows repeated reads are a bottleneck, so it only adds cost, operations and staleness risk." },
        { id: "c", text: "Redis can't be used with Next.js." },
      ],
      correctId: "b",
      explanation:
        "A cache's benefit is conditional on a measured repeated-read bottleneck. Without one, you pay for another service and take on invalidation bugs for no gain.",
    },
  },
  {
    id: "collaborative-workspace",
    kicker: "Challenge B",
    title: "Collaborative workspace",
    description:
      "A small SaaS where users belong to organizations, organizations own projects, members have roles, and people upload files to projects. A previous contractor started the build.",
    objective:
      "Model related data correctly, store files in the right place, and make sure one organization can never see another's data.",
    targetWeights: weights({
      reliability: 3,
      simplicity: 3,
      developerVelocity: 2,
      costEfficiency: 1,
      scalability: 1,
      performance: 0.5,
    }),
    baseline: {
      developerVelocity: 45,
      costEfficiency: 55,
      scalability: 50,
      reliability: 40,
      performance: 50,
      simplicity: 55,
    },
    workload: {
      stage: "early",
      consistency: "high",
      dataShape: "relational",
      budget: "balanced",
      team: "small",
      signals: { ...NO_SIGNALS, multiTenant: true, fileUploads: true },
    },
    requirements: [
      { id: "ui", kind: "capability", anyOf: ["web-ui"], label: "A web UI", why: "Teams collaborate in the browser." },
      { id: "host", kind: "capability", anyOf: ["web-hosting"], label: "Somewhere to host it", why: "The UI must be served." },
      {
        id: "relational",
        kind: "capability",
        anyOf: ["relational-db"],
        label: "Relational data model",
        why: "Orgs → projects → members → roles are related entities that need joins and constraints.",
      },
      { id: "auth", kind: "capability", anyOf: ["authentication"], label: "User sign-in", why: "Members must be identified." },
      {
        id: "authz",
        kind: "decision",
        decision: "authorization",
        notValue: "unspecified",
        label: "An authorization strategy",
        why: "Signing in proves who someone is, not which org's data they may see.",
      },
      {
        id: "files",
        kind: "capability",
        anyOf: ["object-storage"],
        label: "Object storage for uploads",
        why: "Files belong in object storage; their metadata belongs in the database.",
      },
    ],
    useful: ["error-monitoring", "logs-uptime", "ci-cd", "transactional-email", "server-runtime"],
    rubric: [
      "Relational database for related entities",
      "Authorization strategy chosen (not just authentication)",
      "Uploads in object storage, not database rows",
      "Scenario fit of 60 or more, judged with the challenge's priorities",
    ],
    hints: [
      "Look at the data: orgs own projects, projects have members with roles. What kind of database answers \"who can see what\" easily?",
      "Authentication tells you who someone is. Open the Decisions panel to choose how you enforce what they can see.",
      "Some platforms bundle object storage. Check a component's \"Also covers\" list before adding another vendor.",
    ],
    completion: {
      minFit: 60,
      forbidRules: ["nosql-mismatch", "authz-missing", "multiple-databases", "cache-unjustified", "search-unjustified"],
    },
    debrief:
      "Multi-tenant SaaS is mostly a data-modeling and permissions problem. A relational database expresses \"this project belongs to this org\" as a constraint, and row-level security or an application RBAC layer enforces who can read it. Authentication providers don't do that part for you — and files live in object storage with ownership recorded in the database.",
    baselineGraph: {
      nodes: [
        { id: "b-ui", componentId: "nextjs", position: { x: 60, y: 140 } },
        { id: "b-host", componentId: "vercel", position: { x: 360, y: 140 } },
        { id: "b-db", componentId: "mongodb-atlas", position: { x: 660, y: 80 } },
        { id: "b-auth", componentId: "clerk", position: { x: 360, y: 320 } },
      ],
      edges: [
        { id: "b-e1", source: "b-ui", target: "b-host" },
        { id: "b-e2", source: "b-host", target: "b-db" },
        { id: "b-e3", source: "b-ui", target: "b-auth" },
      ],
    },
    baselineDecisions: { ...DEFAULT_DECISIONS },
    reflection: {
      prompt: "A user signs in successfully. What still has to be true before they can read a project?",
      options: [
        { id: "a", text: "Nothing — being signed in means they are allowed." },
        { id: "b", text: "Their session cookie must be less than an hour old." },
        { id: "c", text: "An authorization rule must confirm they are a member of the project's organization." },
      ],
      correctId: "c",
      explanation:
        "Authentication establishes identity. Authorization — via row-level security policies or application-level role checks — decides access to each record.",
    },
  },
  {
    id: "growth-without-overengineering",
    kicker: "Challenge C",
    title: "Handle growth without overengineering",
    description:
      "Your SaaS works and traffic is growing. Users report that some pages feel slow and that big exports sometimes time out. You don't yet know why.",
    objective:
      "Find the real bottlenecks before adding infrastructure, then add only what the evidence supports.",
    targetWeights: weights({
      reliability: 3,
      performance: 3,
      costEfficiency: 2,
      scalability: 2,
      simplicity: 1,
      developerVelocity: 1,
    }),
    baseline: {
      developerVelocity: 50,
      costEfficiency: 55,
      scalability: 42,
      reliability: 42,
      performance: 42,
      simplicity: 50,
    },
    workload: {
      stage: "growing",
      consistency: "high",
      dataShape: "relational",
      budget: "balanced",
      team: "small",
      signals: { ...NO_SIGNALS, repeatedReads: true, asyncWork: true, chargesMoney: true },
      hiddenUntilMonitored: ["repeatedReads", "asyncWork"],
    },
    requirements: [
      { id: "ui", kind: "capability", anyOf: ["web-ui"], label: "A web UI", why: "The product must keep working." },
      { id: "host", kind: "capability", anyOf: ["web-hosting"], label: "Hosting", why: "Still needs to be served." },
      { id: "data", kind: "capability", anyOf: ["relational-db"], label: "Primary database", why: "Existing relational data." },
      {
        id: "measure",
        kind: "capability",
        anyOf: ["error-monitoring", "logs-uptime"],
        label: "Monitoring before optimizing",
        why: "You can't tell which part is slow without measurement.",
      },
      {
        id: "cache-fresh",
        kind: "decision",
        decision: "cacheInvalidation",
        notValue: "unspecified",
        whenPresent: "cache",
        label: "Cache freshness strategy (if you add a cache)",
        why: "A cache without an invalidation plan serves stale data.",
      },
    ],
    useful: ["ci-cd", "error-monitoring", "logs-uptime", "server-runtime", "authentication", "billing", "transactional-email"],
    rubric: [
      "Monitoring connected before (or alongside) optimizations",
      "Each optimization matches a revealed bottleneck",
      "No speculative infrastructure",
      "Scenario fit of 58 or more, judged with the challenge's priorities",
    ],
    hints: [
      "The workload panel shows two unknowns. What would turn an unknown into evidence?",
      "Once you can see the bottlenecks, pick the smallest tool for each: one for repeated reads, one for slow work.",
      "A cache needs a freshness plan. Check the Decisions panel after adding one.",
    ],
    completion: {
      minFit: 58,
      forbidRules: [
        "cache-unmeasured",
        "async-unmeasured",
        "read-bottleneck-unaddressed",
        "async-unaddressed",
        "multiple-databases",
        "search-unjustified",
        "monitoring-missing",
      ],
    },
    debrief:
      "Growth problems are specific: a few hot reads, a few slow jobs. Monitoring turned vague complaints into two concrete bottlenecks, and each got one targeted fix. Managed services can absorb a lot of growth, but each added layer has costs and limits — so the best scaling move is usually measuring, then the smallest change that addresses what you measured.",
    baselineGraph: {
      nodes: [
        { id: "c-ui", componentId: "nextjs", position: { x: 40, y: 160 } },
        { id: "c-host", componentId: "vercel", position: { x: 330, y: 160 } },
        { id: "c-db", componentId: "supabase", position: { x: 640, y: 80 } },
        { id: "c-auth", componentId: "supabase-auth", position: { x: 640, y: 280 } },
        { id: "c-pay", componentId: "stripe-billing", position: { x: 330, y: 360 } },
      ],
      edges: [
        { id: "c-e1", source: "c-ui", target: "c-host" },
        { id: "c-e2", source: "c-host", target: "c-db" },
        { id: "c-e3", source: "c-auth", target: "c-db" },
        { id: "c-e4", source: "c-host", target: "c-pay" },
        { id: "c-e5", source: "c-ui", target: "c-auth" },
      ],
    },
    baselineDecisions: { ...DEFAULT_DECISIONS, billingWebhooks: "server-verified" },
    reflection: {
      prompt: "Traffic doubled and pages feel slow. What's the best first move?",
      options: [
        { id: "a", text: "Add Redis, a queue and a search index to be safe." },
        { id: "b", text: "Add monitoring, find which requests are slow and why, then fix those." },
        { id: "c", text: "Move to a different database." },
      ],
      correctId: "b",
      explanation:
        "Measuring first tells you whether the problem is repeated reads, slow background work, or something else entirely — so each change targets evidence instead of a guess.",
    },
  },
  {
    id: "sandbox",
    kicker: "Free build",
    title: "Sandbox",
    description:
      "No challenge, no grading. Describe your own workload with the toggles and see how different stacks fit it.",
    objective: "Experiment freely. Change the workload and watch the same architecture's fit change.",
    isSandbox: true,
    targetWeights: weights({
      developerVelocity: 2,
      costEfficiency: 2,
      scalability: 1,
      reliability: 2,
      performance: 1,
      simplicity: 2,
    }),
    baseline: {
      developerVelocity: 50,
      costEfficiency: 55,
      scalability: 50,
      reliability: 45,
      performance: 50,
      simplicity: 55,
    },
    workload: {
      stage: "early",
      consistency: "high",
      dataShape: "relational",
      budget: "balanced",
      team: "small",
      signals: { ...NO_SIGNALS },
    },
    requirements: [
      { id: "ui", kind: "capability", anyOf: ["web-ui"], label: "A web UI", why: "Every SaaS needs an interface." },
      { id: "host", kind: "capability", anyOf: ["web-hosting"], label: "Hosting", why: "It must be served somewhere." },
    ],
    useful: [
      "relational-db",
      "authentication",
      "error-monitoring",
      "logs-uptime",
      "ci-cd",
      "server-runtime",
      "product-analytics",
      "transactional-email",
      "billing",
      "object-storage",
      "document-db",
      "key-value-db",
    ],
    rubric: ["No grading in sandbox mode"],
    hints: [
      "Toggle \"Repeated reads are a bottleneck\" with and without a cache on the canvas.",
      "Switch data shape between relational and document and watch the database rules change.",
    ],
    completion: { minFit: 101, forbidRules: [] },
    debrief: "",
    baselineGraph: { nodes: [], edges: [] },
    baselineDecisions: { ...DEFAULT_DECISIONS },
  },
];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

export function getScenario(id: string): Scenario {
  return SCENARIO_BY_ID[id] ?? SCENARIOS[0];
}

export const CHALLENGES = SCENARIOS.filter((s) => !s.isSandbox);
