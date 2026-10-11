import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import { MousePointerClick, Plus } from "lucide-react";
import { useCallback, useEffect, type DragEvent } from "react";
import { getComponent } from "../../data/components";
import { track } from "../../lib/analytics";
import { useWorkbench } from "../../state/WorkbenchContext";
import type { ComponentNode } from "../../state/workbench";
import { DRAG_MIME } from "../palette/Palette";
import { CATEGORY_HUES } from "../shared/CategoryIcon";
import { StackEdge } from "./StackEdge";
import { StackNode } from "./StackNode";

const nodeTypes = { component: StackNode };
const edgeTypes = { stack: StackEdge };

export function Canvas({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { state, dispatch, scenario } = useWorkbench();
  const { screenToFlowPosition, fitView } = useReactFlow();

  // Re-frame the canvas whenever a whole new graph is loaded.
  useEffect(() => {
    if (state.loadCount === 0) return;
    const t = window.setTimeout(() => fitView({ padding: 0.3, maxZoom: 1.1, duration: 250 }), 60);
    return () => window.clearTimeout(t);
  }, [state.loadCount, fitView]);

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const componentId = e.dataTransfer.getData(DRAG_MIME);
      if (!componentId || !getComponent(componentId)) return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      dispatch({ type: "addNode", componentId, position: { x: p.x - 98, y: p.y - 32 } });
      track("node_added", { componentId });
    },
    [dispatch, screenToFlowPosition],
  );

  const empty = state.present.nodes.length === 0;

  return (
    <div className="relative h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<ComponentNode, Edge>
        nodes={state.present.nodes}
        edges={state.present.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(changes) => dispatch({ type: "nodesChange", changes })}
        onEdgesChange={(changes) => dispatch({ type: "edgesChange", changes })}
        onConnect={(connection) => {
          dispatch({ type: "connect", connection });
          track("connection_created");
        }}
        onReconnect={(oldEdge, connection) => dispatch({ type: "reconnect", oldEdge, connection })}
        edgesReconnectable
        onNodeDragStart={() => dispatch({ type: "dragStart" })}
        onNodeDragStop={() => dispatch({ type: "dragStop" })}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={null}
        defaultEdgeOptions={{ type: "stack" }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
        minZoom={0.25}
        maxZoom={2}
        snapToGrid
        snapGrid={[10, 10]}
        proOptions={{ hideAttribution: false }}
        aria-label={`Architecture canvas for ${scenario.title}`}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#2a2a31" />
        <Controls showInteractive={false} position="bottom-left" aria-label="Canvas zoom controls" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          ariaLabel="Minimap"
          nodeColor={(n) => {
            const c = getComponent((n.data as { componentId: string }).componentId);
            return c ? CATEGORY_HUES[c.category] : "#555";
          }}
          nodeStrokeWidth={0}
          style={{ width: 150, height: 96 }}
          className="max-md:hidden!"
        />
      </ReactFlow>

      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="anim-pop pointer-events-auto max-w-sm rounded-2xl border border-dashed border-ink-600 bg-ink-900/80 p-6 text-center backdrop-blur">
            <MousePointerClick className="mx-auto text-amber-glow" size={22} aria-hidden />
            <h2 className="mt-3 text-[15px] font-semibold">Start with what the product needs</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
              Drag a component from the palette, or click its <Plus size={12} className="inline" aria-label="plus" /> button. Then drag
              between the dots on two components to connect them.
            </p>
            <button
              type="button"
              onClick={onOpenPalette}
              className="mt-4 rounded-lg border border-ink-600 px-3 py-1.5 text-[13px] text-ink-100 hover:border-amber-glow lg:hidden"
            >
              Open component palette
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
