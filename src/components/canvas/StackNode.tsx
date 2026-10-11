import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CircleSlash, OctagonAlert, Unplug } from "lucide-react";
import { memo } from "react";
import { getComponent } from "../../data/components";
import { useWorkbench } from "../../state/WorkbenchContext";
import type { ComponentNode } from "../../state/workbench";
import { DIMENSIONS } from "../../types";
import { CATEGORY_HUES, CategoryIcon } from "../shared/CategoryIcon";
import { cx } from "../shared/ui";

const HANDLES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

function StackNodeImpl({ id, data, selected }: NodeProps<ComponentNode>) {
  const { rulesByNode } = useWorkbench();
  const component = getComponent(data.componentId);
  if (!component) {
    return (
      <div className="rounded-xl border border-bad/50 bg-ink-900 px-3 py-2 text-xs text-bad">Unknown component: {data.componentId}</div>
    );
  }
  const rules = rulesByNode.get(id) ?? [];
  const blocker = rules.find((r) => r.severity === "blocker");
  const unconnected = rules.some((r) => r.ruleId === "unconnected");
  const idle = rules.find((r) => r.ruleId === "unneeded-component" || r.ruleId === "redundant-component");
  const warnings = rules.filter(
    (r) => r.severity === "warning" && r.ruleId !== "component-profile" && r.ruleId !== "unconnected" && r !== idle,
  );
  const net = rules.reduce((acc, r) => acc + DIMENSIONS.reduce((s, d) => s + (r.effects[d] ?? 0), 0), 0);

  let status: { icon: typeof AlertTriangle; text: string; cls: string } | null = null;
  if (blocker) status = { icon: OctagonAlert, text: "Blocker", cls: "text-bad border-bad/40 bg-bad/10" };
  else if (unconnected) status = { icon: Unplug, text: "Not connected", cls: "text-ink-300 border-ink-600 bg-ink-800" };
  else if (warnings.length > 0)
    status = { icon: AlertTriangle, text: warnings.length === 1 ? "1 issue" : `${warnings.length} issues`, cls: "text-warn border-warn/35 bg-warn/10" };
  else if (idle)
    status = {
      icon: CircleSlash,
      text: idle.ruleId === "redundant-component" ? "Overlaps" : "No job here",
      cls: "text-ink-300 border-ink-600 bg-ink-800",
    };

  const hue = CATEGORY_HUES[component.category];

  return (
    <div
      className={cx(
        "group relative w-[196px] rounded-xl border bg-ink-900/95 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_24px_-12px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] duration-150",
        selected ? "border-amber-glow shadow-[0_0_0_3px_rgba(245,184,61,0.15)]" : "border-ink-700 hover:border-ink-500",
        unconnected && !selected && "border-dashed",
      )}
      aria-label={`${data.label || component.name}, ${component.role}${status ? `, ${status.text}` : ""}`}
    >
      <span className="absolute left-0 top-3 h-6 w-[3px] rounded-r" style={{ background: hue }} aria-hidden />
      {HANDLES.map((h) => (
        <Handle key={h.id} id={h.id} type="source" position={h.position} aria-label={`Connect ${component.name}`} />
      ))}
      <div className="flex items-start gap-2.5 px-3 pb-2 pt-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-850">
          <CategoryIcon category={component.category} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-ink-100">{data.label || component.name}</div>
          <div className="mt-0.5 truncate text-[11px] leading-tight text-ink-400">
            {data.label ? component.name + " · " : ""}
            {component.role}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-ink-800 px-3 py-1.5">
        {status ? (
          <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium", status.cls)}>
            <status.icon size={11} aria-hidden />
            {status.text}
          </span>
        ) : (
          <span className="text-[10.5px] text-ink-500">{component.category}</span>
        )}
        {!unconnected && net !== 0 && (
          <span
            className={cx("font-mono text-[10.5px] tabular-nums", net > 0 ? "text-good" : "text-bad")}
            title="Net effect of rules involving this component"
          >
            {net > 0 ? "+" : ""}
            {net}
          </span>
        )}
      </div>
    </div>
  );
}

export const StackNode = memo(StackNodeImpl);
