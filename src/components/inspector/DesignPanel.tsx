import { CircleHelp, Eye, EyeOff, Lock, RotateCcw } from "lucide-react";
import { SIGNAL_LABELS } from "../../data/scenarios";
import { DIMENSION_LABELS, normalizeWeights } from "../../engine/scoring";
import { buildGraphContext, hasActive } from "../../engine/validation";
import { useWorkbench } from "../../state/WorkbenchContext";
import { DIMENSIONS, type Decisions, type SignalKey, type Workload } from "../../types";
import { Button, SectionLabel, cx } from "../shared/ui";

const DECISIONS: {
  key: keyof Decisions;
  title: string;
  question: string;
  options: { value: string; label: string; detail: string }[];
}[] = [
  {
    key: "authorization",
    title: "Authorization",
    question: "After someone signs in, how do you decide what they can access?",
    options: [
      { value: "unspecified", label: "Not decided", detail: "Signed-in users can reach whatever the code happens to query." },
      {
        value: "row-level-security",
        label: "Row-level security (PostgreSQL)",
        detail: "Policies in the database filter every query by the user's org membership.",
      },
      {
        value: "app-rbac",
        label: "Application role checks (RBAC)",
        detail: "Server code checks membership and role before every read and write.",
      },
    ],
  },
  {
    key: "billingWebhooks",
    title: "Billing entitlements",
    question: "How does a payment change what a customer can use?",
    options: [
      { value: "unspecified", label: "Not decided", detail: "Access isn't tied to payment events." },
      {
        value: "server-verified",
        label: "Verified webhooks on a server",
        detail: "A server verifies the provider's signature and idempotently updates entitlements in your database.",
      },
    ],
  },
  {
    key: "cacheInvalidation",
    title: "Cache freshness",
    question: "When is cached data refreshed?",
    options: [
      { value: "unspecified", label: "Not decided", detail: "Entries live until something evicts them." },
      {
        value: "ttl-cache-aside",
        label: "Cache-aside with a TTL",
        detail: "Read cache → fall back to the database → store with an expiry. Staleness is bounded.",
      },
    ],
  },
];

export function DesignPanel() {
  const { state, dispatch, scenario, build, evaluation } = useWorkbench();
  const ctx = buildGraphContext(build.nodes, build.edges);
  const relevance: Record<keyof Decisions, boolean> = {
    authorization: hasActive(ctx, "authentication"),
    billingWebhooks: hasActive(ctx, "billing"),
    cacheInvalidation: hasActive(ctx, "cache"),
  };
  const w = normalizeWeights(state.weights);
  const workload: Omit<Workload, "hiddenUntilMonitored"> & { hiddenUntilMonitored?: SignalKey[] } = scenario.isSandbox
    ? state.workload
    : scenario.workload;
  const editable = !!scenario.isSandbox;
  const setWorkload = (patch: Partial<Workload>) => dispatch({ type: "setWorkload", workload: { ...state.workload, ...patch } });

  return (
    <div className="anim-slide space-y-6 p-4">
      <section aria-labelledby="decisions-h">
        <SectionLabel>
          <span id="decisions-h">Design decisions</span>
        </SectionLabel>
        <p className="-mt-1 mb-3 text-[12.5px] leading-relaxed text-ink-300">
          Architecture isn't only boxes. These choices change how the boxes behave.
        </p>
        <div className="space-y-3">
          {DECISIONS.map((d) => (
            <fieldset
              key={d.key}
              className={cx("rounded-xl border p-3", relevance[d.key] ? "border-ink-700 bg-ink-850" : "border-ink-800 bg-ink-900/50")}
            >
              <legend className="sr-only">{d.title}</legend>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{d.title}</span>
                <span className={cx("text-[10.5px]", relevance[d.key] ? "text-amber-glow" : "text-ink-500")}>
                  {relevance[d.key] ? "Relevant to this build" : "Not in use yet"}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink-400">{d.question}</p>
              <div className="mt-2 space-y-1">
                {d.options.map((o) => {
                  const checked = state.present.decisions[d.key] === o.value;
                  return (
                    <label
                      key={o.value}
                      className={cx(
                        "flex cursor-pointer gap-2 rounded-lg border px-2.5 py-2",
                        checked ? "border-amber-glow/50 bg-amber-glow/[0.06]" : "border-transparent hover:bg-ink-800",
                      )}
                    >
                      <input
                        type="radio"
                        name={d.key}
                        value={o.value}
                        checked={checked}
                        onChange={() => dispatch({ type: "setDecision", key: d.key, value: o.value })}
                        className="mt-0.5 accent-amber-glow"
                      />
                      <span>
                        <span className="block text-[12.5px] font-medium">{o.label}</span>
                        <span className="block text-[11.5px] leading-snug text-ink-400">{o.detail}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section aria-labelledby="workload-h">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel className="mb-0">
            <span id="workload-h">Workload</span>
          </SectionLabel>
          {!editable && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-400">
              <Lock size={11} aria-hidden /> Set by the challenge
            </span>
          )}
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-300">
          Rules read these conditions — not vendor names. {editable ? "Change them and watch the same stack's fit change." : "Try the Sandbox to edit them."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["stage", "Stage", ["prototype", "early", "growing", "high-traffic"]],
              ["dataShape", "Data shape", ["relational", "flexible", "document", "key-value"]],
              ["budget", "Budget", ["lean", "balanced", "flexible"]],
              ["team", "Team", ["solo", "small"]],
            ] as const
          ).map(([key, label, options]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[11px] text-ink-400">{label}</span>
              <select
                disabled={!editable}
                value={workload[key]}
                onChange={(e) => setWorkload({ [key]: e.target.value } as Partial<Workload>)}
                className="h-8 w-full rounded-md border border-ink-700 bg-ink-850 px-2 text-[12.5px] capitalize disabled:opacity-70"
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <ul className="mt-3 space-y-1">
          {(Object.keys(SIGNAL_LABELS) as SignalKey[]).map((key) => {
            const hidden = evaluation.hiddenSignals.includes(key);
            const wasHidden = (workload.hiddenUntilMonitored ?? []).includes(key);
            const on = evaluation.effectiveSignals[key];
            return (
              <li key={key}>
                <label
                  className={cx(
                    "flex items-start gap-2.5 rounded-lg border px-2.5 py-2",
                    hidden ? "border-dashed border-ink-600" : "border-ink-800",
                    editable && "cursor-pointer hover:bg-ink-850",
                  )}
                >
                  {editable ? (
                    <input
                      type="checkbox"
                      checked={state.workload.signals[key]}
                      onChange={(e) => setWorkload({ signals: { ...state.workload.signals, [key]: e.target.checked } })}
                      className="mt-0.5 accent-amber-glow"
                    />
                  ) : hidden ? (
                    <CircleHelp size={14} className="mt-0.5 shrink-0 text-ink-400" aria-label="Unknown" />
                  ) : wasHidden ? (
                    <Eye size={14} className="mt-0.5 shrink-0 text-amber-glow" aria-label="Revealed by monitoring" />
                  ) : (
                    <span
                      className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-full border", on ? "border-good bg-good" : "border-ink-500")}
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium">
                      {SIGNAL_LABELS[key].label}
                      {!editable && (
                        <span className={cx("ml-1.5 text-[11px] font-normal", hidden ? "text-ink-400" : on ? "text-good" : "text-ink-500")}>
                          {hidden ? "— unknown" : on ? "— yes" : "— no"}
                        </span>
                      )}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-ink-400">
                      {hidden ? (
                        <span className="inline-flex items-center gap-1">
                          <EyeOff size={11} aria-hidden /> Connect monitoring to find out.
                        </span>
                      ) : (
                        SIGNAL_LABELS[key].detail
                      )}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="priorities-h">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel className="mb-0">
            <span id="priorities-h">Priorities</span>
          </SectionLabel>
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "setWeights", weights: { ...scenario.targetWeights } })}>
            <RotateCcw size={12} /> Reset
          </Button>
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-ink-300">
          Weights decide the scenario-fit average. {scenario.isSandbox ? "" : "Challenge completion always uses the challenge's own priorities."}
        </p>
        <div className="space-y-2.5">
          {DIMENSIONS.map((d) => (
            <label key={d} className="block">
              <span className="flex items-center justify-between text-[12px]">
                <span className="text-ink-200">{DIMENSION_LABELS[d]}</span>
                <span className="font-mono tabular-nums text-ink-400">{Math.round(w[d] * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={state.weights[d]}
                onChange={(e) => dispatch({ type: "setWeights", weights: { ...state.weights, [d]: Number(e.target.value) } })}
                className="mt-1 w-full accent-amber-glow"
                aria-valuetext={`${state.weights[d]} of 5, ${Math.round(w[d] * 100)} percent of the fit`}
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
