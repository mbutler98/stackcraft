import { CircleCheck, OctagonAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { getComponent } from "../../data/components";
import { DIMENSION_LABELS, evaluate } from "../../engine/scoring";
import { listSavedBuilds } from "../../persistence/builds";
import { useWorkbench } from "../../state/WorkbenchContext";
import { DIMENSIONS, type Build, type Evaluation } from "../../types";
import { Modal, SectionLabel, cx } from "./ui";

/** Compare the current build with the challenge baseline or a saved build, under the current scenario. */
export function CompareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { build, evaluation, scenario } = useWorkbench();
  const saved = useMemo(() => (open ? listSavedBuilds() : []), [open]);
  const [choice, setChoice] = useState("baseline");

  const other: Build | null = useMemo(() => {
    if (choice === "baseline") {
      return {
        version: 1,
        name: `${scenario.title} baseline`,
        scenarioId: scenario.id,
        nodes: scenario.baselineGraph.nodes,
        edges: scenario.baselineGraph.edges,
        decisions: scenario.baselineDecisions,
      };
    }
    return saved.find((b) => b.key === choice) ?? null;
  }, [choice, saved, scenario]);

  const otherEval = useMemo(
    () =>
      other
        ? evaluate({
            scenario,
            nodes: other.nodes,
            edges: other.edges,
            decisions: other.decisions,
            weights: build.weights,
            workload: build.workload,
          })
        : null,
    [other, scenario, build.weights, build.workload],
  );

  const names = (b: Build) => [...new Set(b.nodes.map((n) => getComponent(n.componentId)?.name ?? n.componentId))].sort();
  const mine = names(build);
  const theirs = other ? names(other) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Compare architectures"
      description={`Both builds are scored against “${scenario.title}” with your current priorities.`}
    >
      <label className="mb-4 block max-w-sm">
        <span className="mb-1 block text-[11.5px] text-ink-400">Compare current build with</span>
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="h-8 w-full rounded-md border border-ink-700 bg-ink-850 px-2 text-[13px]"
        >
          <option value="baseline">Challenge baseline</option>
          {saved.map((b) => (
            <option key={b.key} value={b.key}>
              Saved: {b.name}
            </option>
          ))}
        </select>
        {saved.length === 0 && <span className="mt-1 block text-[11.5px] text-ink-500">Save builds to compare alternatives side by side.</span>}
      </label>

      {other && otherEval && (
        <div className="grid gap-4 md:grid-cols-2">
          <Column title="Current build" name={build.name} ev={evaluation} versus={otherEval} components={mine} unique={mine.filter((m) => !theirs.includes(m))} />
          <Column title="Comparison" name={other.name} ev={otherEval} versus={evaluation} components={theirs} unique={theirs.filter((t) => !mine.includes(t))} />
        </div>
      )}
    </Modal>
  );
}

function Column({
  title,
  name,
  ev,
  versus,
  components,
  unique,
}: {
  title: string;
  name: string;
  ev: Evaluation;
  versus: Evaluation;
  components: string[];
  unique: string[];
}) {
  return (
    <section className="rounded-xl border border-ink-700 bg-ink-850 p-4" aria-label={title}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">{title}</p>
      <p className="truncate text-[14px] font-semibold">{name}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tabular-nums leading-none">{ev.weightedFit}</span>
        <span className="text-[12px] text-ink-400">fit</span>
        <Diff v={ev.weightedFit - versus.weightedFit} />
      </div>
      <p className={cx("mt-1.5 flex items-center gap-1.5 text-[12px]", ev.blockers.length ? "text-bad" : "text-good")}>
        {ev.blockers.length ? <OctagonAlert size={13} aria-hidden /> : <CircleCheck size={13} aria-hidden />}
        {ev.blockers.length ? `Blockers: ${ev.blockers.map((b) => b.label).join(", ")}` : "No blockers"}
      </p>
      <ul className="mt-4 space-y-2">
        {DIMENSIONS.map((d) => (
          <li key={d}>
            <div className="flex justify-between text-[12px]">
              <span className="text-ink-300">{DIMENSION_LABELS[d]}</span>
              <span className="flex items-center gap-1.5 font-mono tabular-nums">
                <Diff v={ev.scores[d] - versus.scores[d]} />
                {ev.scores[d]}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-ink-700">
              <div className="bar-fill h-full rounded-full bg-amber-glow" style={{ width: `${ev.scores[d]}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <SectionLabel className="mt-4">Components ({components.length})</SectionLabel>
      <p className="text-[12px] leading-relaxed text-ink-300">
        {components.length === 0
          ? "None"
          : components.map((c, i) => (
              <span key={c}>
                <span className={unique.includes(c) ? "font-medium text-amber-glow" : undefined}>{c}</span>
                {i < components.length - 1 ? " · " : ""}
              </span>
            ))}
      </p>
      {unique.length > 0 && <p className="mt-1 text-[11px] text-ink-500">Highlighted: only in this build.</p>}
    </section>
  );
}

function Diff({ v }: { v: number }) {
  if (v === 0) return null;
  return <span className={cx("font-mono text-[11px]", v > 0 ? "text-good" : "text-bad")}>{v > 0 ? `+${v}` : v}</span>;
}
