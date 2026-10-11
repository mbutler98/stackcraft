import { ChevronDown, ChevronUp, CircleCheck, CircleX, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { DIMENSION_LABELS, DIMENSION_SHORT, archetype } from "../../engine/scoring";
import { useWorkbench } from "../../state/WorkbenchContext";
import { DIMENSIONS, type Dimension } from "../../types";
import { RuleCard, SeverityIcon } from "../shared/RuleCard";
import { EffectPills, cx } from "../shared/ui";

type Tab = "checks" | "changes" | "rules" | "cost";

function barColor(v: number) {
  if (v >= 70) return "bg-good";
  if (v >= 45) return "bg-amber-glow";
  return "bg-bad";
}

export function StatsPanel({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (c: boolean) => void }) {
  const { evaluation, deltas, state, scenario } = useWorkbench();
  const [tab, setTab] = useState<Tab>("checks");
  const latest = deltas[0];
  const arch = archetype(evaluation, state.present.nodes.length);
  const hard = evaluation.constraints.filter((c) => c.hard);
  const passed = hard.filter((c) => c.status === "pass").length;

  if (collapsed) {
    return (
      <div className="flex h-11 items-center gap-4 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1.5 text-[12px] text-ink-300 hover:text-ink-100"
          aria-expanded={false}
        >
          <ChevronUp size={14} /> Stats
        </button>
        <span className="font-mono text-[13px] font-semibold text-amber-glow tabular-nums">Fit {evaluation.weightedFit}</span>
        <span className={cx("inline-flex items-center gap-1 text-[12px]", evaluation.blockers.length ? "text-bad" : "text-good")}>
          {evaluation.blockers.length ? <OctagonAlert size={13} aria-hidden /> : <CircleCheck size={13} aria-hidden />}
          {evaluation.blockers.length ? `${evaluation.blockers.length} blocker${evaluation.blockers.length > 1 ? "s" : ""}` : "No blockers"}
        </span>
        <span className="hidden gap-3 sm:flex">
          {DIMENSIONS.map((d) => (
            <span key={d} className="font-mono text-[11px] text-ink-400" title={DIMENSION_LABELS[d]}>
              {DIMENSION_SHORT[d]} <span className="text-ink-100">{evaluation.scores[d]}</span>
            </span>
          ))}
        </span>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-0 md:grid-cols-[minmax(190px,220px)_minmax(240px,1fr)_minmax(300px,1.3fr)]">
      {/* Fit + archetype */}
      <section aria-label="Scenario fit" className="flex flex-col justify-between border-b border-ink-800 p-4 md:border-b-0 md:border-r">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">Scenario fit</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span key={evaluation.weightedFit} className="anim-pop text-[34px] font-semibold leading-none tabular-nums text-ink-100">
                {evaluation.weightedFit}
              </span>
              <span className="text-[12px] text-ink-400">/ 100</span>
              {latest && latest.delta.fit !== 0 && (
                <span
                  key={latest.id}
                  className={cx("anim-delta font-mono text-[12px] font-medium", latest.delta.fit > 0 ? "text-good" : "text-bad")}
                >
                  {latest.delta.fit > 0 ? "+" : ""}
                  {latest.delta.fit}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100"
            aria-label="Collapse stats panel"
            aria-expanded
            title="Collapse"
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="mt-3">
          <p className="text-[13px] font-semibold text-amber-glow">{arch.name}</p>
          <p className="text-[11.5px] text-ink-400">{arch.blurb}</p>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-500">
          <Info size={11} className="mt-px shrink-0" aria-hidden />
          Teaching estimates for this scenario — not benchmarks or cost predictions.
        </p>
      </section>

      {/* Six stats */}
      <section aria-label="Architecture stats" className="border-b border-ink-800 p-4 md:border-b-0 md:border-r">
        <ul className="space-y-2.5">
          {DIMENSIONS.map((d) => (
            <StatBar key={d} d={d} value={evaluation.scores[d]} delta={latest?.delta.scores[d]} deltaKey={latest?.id} />
          ))}
        </ul>
      </section>

      {/* Tabs */}
      <section aria-label="Checks and explanations" className="flex min-h-0 flex-col">
        <div role="tablist" className="flex gap-1 border-b border-ink-800 px-2 pt-2">
          {(
            [
              ["checks", `Requirements ${passed}/${hard.length}`],
              ["changes", "Last change"],
              ["rules", `Why (${evaluation.rules.length})`],
              ["cost", "Cost"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                "-mb-px rounded-t-md border-b-2 px-2.5 pb-1.5 pt-1 text-[12px] font-medium",
                tab === id ? "border-amber-glow text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {tab === "checks" && (
            <ul className="space-y-1">
              {evaluation.constraints.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[12.5px]">
                  {c.status === "pass" ? (
                    <CircleCheck size={14} className="mt-px shrink-0 text-good" aria-label="Passed" />
                  ) : c.status === "fail" ? (
                    <CircleX size={14} className="mt-px shrink-0 text-bad" aria-label="Failed" />
                  ) : (
                    <TriangleAlert size={14} className="mt-px shrink-0 text-warn" aria-label="Warning" />
                  )}
                  <span className="min-w-0">
                    <span className={cx("font-medium", c.status === "fail" ? "text-ink-100" : "text-ink-200")}>
                      {c.label}
                      {!c.hard && <span className="ml-1 text-[10.5px] font-normal text-ink-500">integrity</span>}
                    </span>
                    {c.status !== "pass" && <span className="block text-[11.5px] leading-snug text-ink-400">{c.detail}</span>}
                  </span>
                </li>
              ))}
              {scenario.isSandbox && <li className="pt-1 text-[11.5px] text-ink-400">Sandbox has minimal requirements — describe your workload in Decisions & workload.</li>}
            </ul>
          )}

          {tab === "changes" &&
            (!latest ? (
              <p className="text-[12.5px] text-ink-400">Make a change — add, connect, remove or decide — to see exactly what it did to the scores and why.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[12.5px]">
                  <span className="font-medium text-ink-100">{latest.action}</span>
                  <span className="ml-2 font-mono text-[11.5px] text-ink-400">
                    fit {latest.delta.fit >= 0 ? "+" : ""}
                    {latest.delta.fit}
                  </span>
                </p>
                <EffectPills effects={latest.delta.scores} />
                {latest.delta.added.length + latest.delta.removed.length + latest.delta.changed.length === 0 && (
                  <p className="text-[12px] text-ink-400">Only the weighting changed.</p>
                )}
                {latest.delta.added.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-ink-400">Now applies</p>
                    {latest.delta.added.map((r) => (
                      <RuleCard key={r.id} rule={r} compact />
                    ))}
                  </div>
                )}
                {latest.delta.changed.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-ink-400">Changed</p>
                    {latest.delta.changed.map(({ after }) => (
                      <RuleCard key={after.id} rule={after} compact />
                    ))}
                  </div>
                )}
                {latest.delta.removed.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-ink-400">No longer applies</p>
                    {latest.delta.removed.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-800 px-2 py-1.5 text-[12px] text-ink-300 line-through decoration-ink-500">
                        <SeverityIcon severity={r.severity} /> {r.title}
                      </div>
                    ))}
                  </div>
                )}
                {deltas.length > 1 && (
                  <details className="pt-1 text-[12px]">
                    <summary className="cursor-pointer text-ink-400 hover:text-ink-100">Earlier changes</summary>
                    <ul className="mt-1 space-y-0.5">
                      {deltas.slice(1).map((d) => (
                        <li key={d.id} className="flex justify-between gap-2 text-ink-300">
                          <span className="truncate">{d.action}</span>
                          <span className={cx("font-mono", d.delta.fit > 0 ? "text-good" : d.delta.fit < 0 ? "text-bad" : "text-ink-500")}>
                            {d.delta.fit > 0 ? "+" : ""}
                            {d.delta.fit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}

          {tab === "rules" && (
            <div className="space-y-1">
              {evaluation.rules.length === 0 && <p className="text-[12.5px] text-ink-400">No rules apply to an empty canvas.</p>}
              {[...evaluation.rules]
                .sort((a, b) => order(a.severity) - order(b.severity))
                .map((r) => (
                  <RuleCard key={r.id} rule={r} compact />
                ))}
            </div>
          )}

          {tab === "cost" && (
            <div className="space-y-2 text-[12.5px]">
              <p>
                Qualitative cost band:{" "}
                <span
                  className={cx(
                    "rounded-md border px-1.5 py-0.5 font-medium capitalize",
                    evaluation.cost.band === "low" ? "border-good/40 text-good" : evaluation.cost.band === "moderate" ? "border-warn/40 text-warn" : "border-bad/40 text-bad",
                  )}
                >
                  {evaluation.cost.band}
                </span>
              </p>
              <p className="text-ink-400">Based only on how many usage-billed services are connected. No prices are estimated.</p>
              {evaluation.cost.drivers.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-ink-300 marker:text-ink-600">
                  {evaluation.cost.drivers.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
              <p className="text-ink-400">
                Unknown inputs that decide the real bill: {evaluation.cost.unknowns.join(", ").toLowerCase()}.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function order(s: string) {
  return { blocker: 0, warning: 1, neutral: 2, positive: 3 }[s] ?? 4;
}

function StatBar({ d, value, delta, deltaKey }: { d: Dimension; value: number; delta?: number; deltaKey?: number }) {
  return (
    <li>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-ink-200">
          <span className="mr-1.5 font-mono text-[10px] text-ink-500">{DIMENSION_SHORT[d]}</span>
          {DIMENSION_LABELS[d]}
        </span>
        <span className="flex items-center gap-1.5">
          {delta !== undefined && delta !== 0 && (
            <span key={deltaKey} className={cx("anim-delta font-mono text-[11px]", delta > 0 ? "text-good" : "text-bad")}>
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
          <span className="w-6 text-right font-mono tabular-nums text-ink-100">{value}</span>
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-ink-800"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={DIMENSION_LABELS[d]}
      >
        <div className={cx("bar-fill h-full rounded-full", barColor(value))} style={{ width: `${value}%` }} />
      </div>
    </li>
  );
}
