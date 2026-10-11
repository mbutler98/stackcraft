/**
 * Privacy-preserving analytics adapter. Disabled by default.
 *
 * - Only the events below can be sent.
 * - Properties are restricted to catalog/scenario ids, numbers and booleans:
 *   never build names, custom labels or imported JSON.
 * - Enable by setting VITE_ANALYTICS_ENABLED="true" at build time AND calling
 *   `registerAnalyticsAdapter()` with your provider. Only use a provider's
 *   *public* project key: every VITE_* variable is bundled into the client.
 */

export type AnalyticsEvent =
  | "challenge_started"
  | "node_added"
  | "connection_created"
  | "score_explanation_opened"
  | "challenge_completed"
  | "build_exported";

export type AnalyticsProps = Record<string, string | number | boolean>;

export type AnalyticsAdapter = {
  track: (event: AnalyticsEvent, props: AnalyticsProps) => void;
};

const ENABLED = import.meta.env?.VITE_ANALYTICS_ENABLED === "true";
const SAFE_KEY = /^(scenarioId|componentId|ruleId|category|fit|complete|count)$/;
const SAFE_VALUE = /^[a-z0-9-]{1,48}$/;

let adapter: AnalyticsAdapter | null = null;

export function registerAnalyticsAdapter(next: AnalyticsAdapter | null) {
  adapter = next;
}

export function analyticsEnabled() {
  return ENABLED && adapter !== null;
}

export function sanitize(props: AnalyticsProps): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (!SAFE_KEY.test(k)) continue;
    if (typeof v === "string" && !SAFE_VALUE.test(v)) continue;
    out[k] = v;
  }
  return out;
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  if (!ENABLED || !adapter) return;
  try {
    adapter.track(event, sanitize(props));
  } catch {
    // Analytics must never break the app.
  }
}
