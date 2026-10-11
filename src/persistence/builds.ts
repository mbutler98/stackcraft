import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";
import { COMPONENT_BY_ID } from "../data/components";
import { SCENARIO_BY_ID } from "../data/scenarios";
import type { Build } from "../types";

// ────────────────────────────────────────────────────────────────────────────
// Schema

const dimensionWeights = z.object({
  developerVelocity: z.number().min(0).max(10),
  costEfficiency: z.number().min(0).max(10),
  scalability: z.number().min(0).max(10),
  reliability: z.number().min(0).max(10),
  performance: z.number().min(0).max(10),
  simplicity: z.number().min(0).max(10),
});

const signals = z.object({
  repeatedReads: z.boolean(),
  asyncWork: z.boolean(),
  multiTenant: z.boolean(),
  fileUploads: z.boolean(),
  searchHeavy: z.boolean(),
  botAbuse: z.boolean(),
  chargesMoney: z.boolean(),
});

export const BuildSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1, "Build name can't be empty").max(80),
    scenarioId: z.string(),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          componentId: z.string(),
          label: z.string().max(60).optional(),
          position: z.object({ x: z.number().finite(), y: z.number().finite() }),
        }),
      )
      .max(80, "A build can have at most 80 components"),
    edges: z
      .array(z.object({ id: z.string().min(1).max(64), source: z.string(), target: z.string() }))
      .max(200, "A build can have at most 200 connections"),
    decisions: z.object({
      authorization: z.enum(["unspecified", "row-level-security", "app-rbac"]),
      billingWebhooks: z.enum(["unspecified", "server-verified"]),
      cacheInvalidation: z.enum(["unspecified", "ttl-cache-aside"]),
    }),
    weights: dimensionWeights.optional(),
    workload: z
      .object({
        stage: z.enum(["prototype", "early", "growing", "high-traffic"]),
        consistency: z.enum(["high", "eventual-ok"]),
        dataShape: z.enum(["relational", "flexible", "document", "key-value"]),
        budget: z.enum(["lean", "balanced", "flexible"]),
        team: z.enum(["solo", "small"]),
        signals,
      })
      .optional(),
    savedAt: z.string().optional(),
  })
  .superRefine((b, ctx) => {
    if (!SCENARIO_BY_ID[b.scenarioId]) {
      ctx.addIssue({
        code: "custom",
        path: ["scenarioId"],
        message: `Unknown challenge "${b.scenarioId}". Expected one of: ${Object.keys(SCENARIO_BY_ID).join(", ")}`,
      });
    }
    const nodeIds = new Set<string>();
    b.nodes.forEach((n, i) => {
      if (!COMPONENT_BY_ID[n.componentId]) {
        ctx.addIssue({
          code: "custom",
          path: ["nodes", i, "componentId"],
          message: `Unknown component "${n.componentId}"`,
        });
      }
      if (nodeIds.has(n.id)) {
        ctx.addIssue({ code: "custom", path: ["nodes", i, "id"], message: `Duplicate node id "${n.id}"` });
      }
      nodeIds.add(n.id);
    });
    b.edges.forEach((e, i) => {
      if (!nodeIds.has(e.source))
        ctx.addIssue({ code: "custom", path: ["edges", i, "source"], message: `Connection source "${e.source}" doesn't match any node` });
      if (!nodeIds.has(e.target))
        ctx.addIssue({ code: "custom", path: ["edges", i, "target"], message: `Connection target "${e.target}" doesn't match any node` });
    });
  });

export type ParseResult = { ok: true; build: Build } | { ok: false; errors: string[] };

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");
}

export function parseBuild(value: unknown): ParseResult {
  const result = BuildSchema.safeParse(value);
  if (result.success) return { ok: true, build: result.data as Build };
  const errors = result.error.issues.slice(0, 8).map((i) => {
    const where = formatPath(i.path);
    return where ? `${where}: ${i.message}` : i.message;
  });
  if (result.error.issues.length > 8) errors.push(`…and ${result.error.issues.length - 8} more problems`);
  return { ok: false, errors };
}

export function parseBuildJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  return parseBuild(data);
}

export function serializeBuild(build: Build): string {
  return JSON.stringify(build, null, 2);
}

// ────────────────────────────────────────────────────────────────────────────
// URL sharing (compressed, hash-only — never sent to a server)

export const SHARE_PREFIX = "#build=";

export function encodeShareHash(build: Build): string {
  const { savedAt: _savedAt, ...rest } = build;
  return SHARE_PREFIX + compressToEncodedURIComponent(JSON.stringify(rest));
}

export function decodeShareHash(hash: string): ParseResult | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  const json = decompressFromEncodedURIComponent(hash.slice(SHARE_PREFIX.length));
  if (!json) return { ok: false, errors: ["The shared link is incomplete or corrupted."] };
  return parseBuildJson(json);
}

// ────────────────────────────────────────────────────────────────────────────
// Browser-local storage

const BUILDS_KEY = "stackcraft.builds.v1";
const AUTOSAVE_KEY = "stackcraft.autosave.v1";

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export type SavedBuild = Build & { savedAt: string; key: string };

export function listSavedBuilds(): SavedBuild[] {
  const raw = safeGet(BUILDS_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown[];
    if (!Array.isArray(data)) return [];
    const out: SavedBuild[] = [];
    for (const item of data) {
      const parsed = parseBuild(item);
      const key = (item as { key?: unknown })?.key;
      if (parsed.ok && typeof key === "string") {
        out.push({ ...parsed.build, key, savedAt: parsed.build.savedAt ?? new Date(0).toISOString() });
      }
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export function saveBuild(build: Build, key?: string): SavedBuild | null {
  const all = listSavedBuilds();
  const entry: SavedBuild = {
    ...build,
    savedAt: new Date().toISOString(),
    key: key ?? `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
  };
  const next = [entry, ...all.filter((b) => b.key !== entry.key)].slice(0, 50);
  return safeSet(BUILDS_KEY, JSON.stringify(next)) ? entry : null;
}

export function deleteSavedBuild(key: string): void {
  safeSet(BUILDS_KEY, JSON.stringify(listSavedBuilds().filter((b) => b.key !== key)));
}

export function loadAutosave(): Build | null {
  const raw = safeGet(AUTOSAVE_KEY);
  if (!raw) return null;
  const parsed = parseBuildJson(raw);
  return parsed.ok ? parsed.build : null;
}

export function writeAutosave(build: Build): boolean {
  return safeSet(AUTOSAVE_KEY, JSON.stringify(build));
}

// ────────────────────────────────────────────────────────────────────────────
// Learning progress (XP, badges) — also browser-local.

const PROGRESS_KEY = "stackcraft.progress.v1";

export type Progress = {
  xp: number;
  completed: string[];
  reflectionsCorrect: string[];
  reflectionsAttempted: string[];
  explanationsRead: string[];
  badges: string[];
};

export const EMPTY_PROGRESS: Progress = {
  xp: 0,
  completed: [],
  reflectionsCorrect: [],
  reflectionsAttempted: [],
  explanationsRead: [],
  badges: [],
};

const ProgressSchema = z.object({
  xp: z.number().min(0),
  completed: z.array(z.string()),
  reflectionsCorrect: z.array(z.string()),
  reflectionsAttempted: z.array(z.string()),
  explanationsRead: z.array(z.string()),
  badges: z.array(z.string()),
});

export function loadProgress(): Progress {
  const raw = safeGet(PROGRESS_KEY);
  if (!raw) return { ...EMPTY_PROGRESS };
  try {
    const parsed = ProgressSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...EMPTY_PROGRESS };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export function saveProgress(p: Progress): void {
  safeSet(PROGRESS_KEY, JSON.stringify(p));
}
