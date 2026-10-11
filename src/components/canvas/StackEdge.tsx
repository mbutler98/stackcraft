import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { AlertTriangle, X } from "lucide-react";
import { useWorkbench } from "../../state/WorkbenchContext";

function box(n: InternalNode) {
  const w = n.measured.width ?? 196;
  const h = n.measured.height ?? 80;
  const { x, y } = n.internals.positionAbsolute;
  return { cx: x + w / 2, cy: y + h / 2, w, h };
}

/**
 * Connections are undirected, so edges "float": they attach to whichever sides of the
 * two components face each other, regardless of which handle was dragged.
 */
function floatingEnds(a: InternalNode, b: InternalNode) {
  const s = box(a);
  const t = box(b);
  const dx = t.cx - s.cx;
  const dy = t.cy - s.cy;
  if (Math.abs(dx) * 0.6 > Math.abs(dy)) {
    const right = dx > 0;
    return {
      sourceX: s.cx + (right ? s.w / 2 : -s.w / 2),
      sourceY: s.cy,
      sourcePosition: right ? Position.Right : Position.Left,
      targetX: t.cx + (right ? -t.w / 2 : t.w / 2),
      targetY: t.cy,
      targetPosition: right ? Position.Left : Position.Right,
    };
  }
  const down = dy > 0;
  return {
    sourceX: s.cx,
    sourceY: s.cy + (down ? s.h / 2 : -s.h / 2),
    sourcePosition: down ? Position.Bottom : Position.Top,
    targetX: t.cx,
    targetY: t.cy + (down ? -t.h / 2 : t.h / 2),
    targetPosition: down ? Position.Top : Position.Bottom,
  };
}

export function StackEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const { evaluation, dispatch } = useWorkbench();
  const issue = evaluation.edgeIssues.find((i) => i.edgeId === id);
  const sNode = useInternalNode(source);
  const tNode = useInternalNode(target);
  const ends =
    sNode && tNode && source !== target
      ? floatingEnds(sNode, tNode)
      : { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] = getBezierPath(ends);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={
          issue
            ? { stroke: "var(--color-bad)", strokeDasharray: "5 4", opacity: 0.85 }
            : selected
              ? { stroke: "var(--color-amber-glow)" }
              : undefined
        }
        interactionWidth={18}
      />
      {(issue || selected) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {issue && (
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full border border-bad/50 bg-ink-900 text-bad"
                title={issue.message}
                role="img"
                aria-label={issue.message}
              >
                <AlertTriangle size={11} />
              </span>
            )}
            {selected && (
              <button
                type="button"
                onClick={() => dispatch({ type: "deleteEdge", id })}
                aria-label="Delete connection"
                title="Delete connection"
                className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-500 bg-ink-850 text-ink-200 hover:border-bad hover:text-bad"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
