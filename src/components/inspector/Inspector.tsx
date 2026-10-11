import { MousePointer2, TrendingDown, TrendingUp } from "lucide-react";
import { DIMENSION_LABELS } from "../../engine/scoring";
import { useWorkbench } from "../../state/WorkbenchContext";
import { RuleCard } from "../shared/RuleCard";
import { SectionLabel, cx } from "../shared/ui";
import { ComponentDetails } from "./ComponentDetails";
import { DesignPanel } from "./DesignPanel";

export type InspectorTab = "inspect" | "design";

export function Inspector({
  tab,
  setTab,
  previewId,
  setPreviewId,
  onAdd,
}: {
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  previewId: string | null;
  setPreviewId: (id: string | null) => void;
  onAdd: (id: string) => void;
}) {
  const { state } = useWorkbench();
  const selected = state.present.nodes.filter((n) => n.selected);
  const node = selected.length === 1 ? selected[0] : undefined;

  return (
    <aside aria-label="Inspector" className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Inspector views" className="flex gap-1 border-b border-ink-800 p-2">
        {(
          [
            ["inspect", "Inspect"],
            ["design", "Decisions & workload"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx(
              "h-7 flex-1 rounded-md px-2 text-[12.5px] font-medium transition-colors",
              tab === id ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:text-ink-100",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === "design" ? (
          <DesignPanel />
        ) : node ? (
          <ComponentDetails key={node.id} componentId={node.data.componentId} node={node} onAdd={onAdd} />
        ) : previewId ? (
          <ComponentDetails key={previewId} componentId={previewId} onAdd={onAdd} onClosePreview={() => setPreviewId(null)} />
        ) : (
          <Overview multi={selected.length} />
        )}
      </div>
    </aside>
  );
}

function Overview({ multi }: { multi: number }) {
  const { evaluation } = useWorkbench();
  return (
    <div className="anim-slide space-y-5 p-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-ink-800 bg-ink-900 p-3 text-[12.5px] text-ink-300">
        <MousePointer2 size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden />
        {multi > 1
          ? `${multi} components selected. Select one to inspect it, or press Delete to remove them.`
          : "Select a component on the canvas (or a name in the palette) to see what it does, why it matters, and how it affects this build."}
      </div>

      <section>
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={12} className="text-good" aria-hidden /> Top strengths
          </span>
        </SectionLabel>
        <div className="space-y-3">
          {evaluation.strengths.map((s) => (
            <div key={s.dimension}>
              <div className="mb-1 flex justify-between text-[12.5px]">
                <span className="font-medium">{DIMENSION_LABELS[s.dimension]}</span>
                <span className="font-mono tabular-nums text-ink-300">{s.score}</span>
              </div>
              {s.evidence.length === 0 ? (
                <p className="text-[11.5px] text-ink-400">No rule raises this yet — it's mostly the scenario baseline.</p>
              ) : (
                <div className="space-y-1">
                  {s.evidence.map((r) => (
                    <RuleCard key={r.id} rule={r} compact />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <TrendingDown size={12} className="text-bad" aria-hidden /> Top weaknesses
          </span>
        </SectionLabel>
        <div className="space-y-3">
          {evaluation.weaknesses.map((s) => (
            <div key={s.dimension}>
              <div className="mb-1 flex justify-between text-[12.5px]">
                <span className="font-medium">{DIMENSION_LABELS[s.dimension]}</span>
                <span className="font-mono tabular-nums text-ink-300">{s.score}</span>
              </div>
              {s.evidence.length === 0 ? (
                <p className="text-[11.5px] text-ink-400">Nothing is pulling this down — it's just not boosted.</p>
              ) : (
                <div className="space-y-1">
                  {s.evidence.map((r) => (
                    <RuleCard key={r.id} rule={r} compact />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
