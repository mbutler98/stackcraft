import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { LayoutGrid, List } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "./components/canvas/Canvas";
import { ListView } from "./components/canvas/ListView";
import { ChallengeDrawer } from "./components/challenges/ChallengeDrawer";
import { CompletionModal } from "./components/challenges/CompletionModal";
import { Inspector, type InspectorTab } from "./components/inspector/Inspector";
import { Palette } from "./components/palette/Palette";
import { BuildsModal } from "./components/shared/BuildsModal";
import { CompareModal } from "./components/shared/CompareModal";
import { ProgressModal } from "./components/shared/ProgressModal";
import { ConfirmModal, Toasts } from "./components/shared/Toasts";
import { TopBar } from "./components/shared/TopBar";
import { cx } from "./components/shared/ui";
import { StatsPanel } from "./components/stats/StatsPanel";
import { getScenario } from "./data/scenarios";
import { awardCompletion } from "./engine/progress";
import { track } from "./lib/analytics";
import { saveBuild } from "./persistence/builds";
import { WorkbenchProvider, useWorkbench } from "./state/WorkbenchContext";

const NODE_W = 196;
const NODE_H = 86;

/** Finds the nearest grid spot (spiralling out from `start`) that doesn't overlap an existing node. */
function findFreeSpot(start: { x: number; y: number }, taken: { x: number; y: number }[]) {
  const overlaps = (p: { x: number; y: number }) =>
    taken.some((t) => Math.abs(t.x - p.x) < NODE_W + 24 && Math.abs(t.y - p.y) < NODE_H + 24);
  const stepX = NODE_W + 40;
  const stepY = NODE_H + 40;
  for (let ring = 0; ring < 8; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const p = { x: Math.round((start.x + dx * stepX) / 10) * 10, y: Math.round((start.y + dy * stepY) / 10) * 10 };
        if (!overlaps(p)) return p;
      }
    }
  }
  return { x: start.x + 40, y: start.y + 40 };
}

type ModalName = "builds" | "share" | "compare" | "progress" | "completion" | "reset" | "switch" | null;

function Workbench() {
  const { state, dispatch, scenario, completion, progress, setProgress, toast, build } = useWorkbench();
  const { screenToFlowPosition } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<"canvas" | "list">("canvas");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const [statsCollapsed, setStatsCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspect");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalName>(null);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [completionXp, setCompletionXp] = useState(0);
  const [completionKey, setCompletionKey] = useState(0);

  const addComponent = useCallback(
    (componentId: string) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const center =
        rect && rect.width > 0 && view === "canvas"
          ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : { x: 400, y: 200 };
      const position = findFreeSpot(
        { x: center.x - 98, y: center.y - 40 },
        state.present.nodes.map((n) => n.position),
      );
      dispatch({ type: "addNode", componentId, position });
      track("node_added", { componentId });
      setPreviewId(null);
      setInspectorTab("inspect");
      setPaletteOpen(false);
    },
    [dispatch, screenToFlowPosition, state.present.nodes, view],
  );

  const inspectCatalog = (componentId: string) => {
    dispatch({ type: "select", ids: [] });
    setPreviewId(componentId);
    setInspectorTab("inspect");
    setInspectorOpen(true);
    setPaletteOpen(false);
  };

  const switchScenario = (id: string, save: boolean) => {
    if (save) saveBuild(build);
    dispatch({ type: "loadScenario", scenarioId: id });
    track("challenge_started", { scenarioId: id });
    setPendingScenario(null);
    setModal(null);
    setChallengesOpen(false);
    setPreviewId(null);
    toast(save ? `Saved your previous build. Started “${getScenario(id).title}”.` : `Started “${getScenario(id).title}”.`, "info");
  };

  const requestSwitch = (id: string) => {
    if (state.revision === 0) switchScenario(id, false);
    else {
      setPendingScenario(id);
      setModal("switch");
    }
  };

  const finish = () => {
    if (!completion.complete) return;
    const { progress: next, gained } = awardCompletion(progress, scenario.id);
    if (gained > 0) {
      setProgress(next);
      track("challenge_completed", { scenarioId: scenario.id, fit: completion.fit });
    }
    setCompletionXp(gained);
    setCompletionKey((k) => k + 1);
    setChallengesOpen(false);
    setModal("completion");
  };

  const tryAnother = () => {
    dispatch({ type: "reset" });
    setModal(null);
    setChallengesOpen(false);
    toast("Back to the baseline. Undo restores your previous build.", "info");
  };

  // Nudge once when a challenge becomes completable.
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (completion.complete && !notified.current.has(scenario.id)) {
      notified.current.add(scenario.id);
      if (!progress.completed.includes(scenario.id)) toast("Every completion check passes — finish the challenge from the top bar.", "success");
    }
  }, [completion.complete, scenario.id, progress.completed, toast]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.closest("dialog"))) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && e.key.toLowerCase() === "d") {
        const ids = state.present.nodes.filter((n) => n.selected).map((n) => n.id);
        if (ids.length) {
          e.preventDefault();
          dispatch({ type: "duplicateNodes", ids });
        }
      } else if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
        if (state.present.nodes.some((n) => n.selected) || state.present.edges.some((x) => x.selected)) {
          e.preventDefault();
          dispatch({ type: "deleteSelection" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.present.nodes, state.present.edges]);

  // Selecting a node replaces any catalog preview.
  const selectedCount = state.present.nodes.filter((n) => n.selected).length;
  useEffect(() => {
    if (selectedCount > 0) setPreviewId(null);
  }, [selectedCount]);

  return (
    <div className="flex h-full flex-col">
      <a href="#canvas" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-amber-glow focus:px-3 focus:py-1 focus:text-ink-950">
        Skip to canvas
      </a>
      <TopBar
        onChallenges={() => setChallengesOpen(true)}
        onBuilds={() => setModal("builds")}
        onShare={() => setModal("share")}
        onCompare={() => setModal("compare")}
        onReset={() => setModal("reset")}
        onProgress={() => setModal("progress")}
        onFinish={finish}
        onTogglePalette={() => {
          setPaletteOpen((o) => !o);
          setInspectorOpen(false);
        }}
        onToggleInspector={() => {
          setInspectorOpen((o) => !o);
          setPaletteOpen(false);
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        {(paletteOpen || inspectorOpen) && (
          <button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 z-20 bg-black/40 lg:hidden"
            onClick={() => {
              setPaletteOpen(false);
              setInspectorOpen(false);
            }}
          />
        )}

        <div
          className={cx(
            "z-30 w-[268px] shrink-0 border-r border-ink-800 bg-ink-900",
            "absolute inset-y-0 left-0 lg:static",
            paletteOpen ? "anim-slide" : "max-lg:hidden",
          )}
        >
          <Palette onAdd={addComponent} onInspect={inspectCatalog} />
        </div>

        <main id="canvas" className="flex min-w-0 flex-1 flex-col">
          <div ref={canvasRef} className="relative min-h-0 flex-1">
            <div className="absolute left-3 top-3 z-10 flex rounded-lg border border-ink-700 bg-ink-900/90 p-0.5 backdrop-blur" role="group" aria-label="Editing view">
              {(
                [
                  ["canvas", "Canvas", LayoutGrid],
                  ["list", "List", List],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={cx(
                    "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium",
                    view === id ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-100",
                  )}
                >
                  <Icon size={13} aria-hidden /> {label}
                </button>
              ))}
            </div>
            {view === "canvas" ? <Canvas onOpenPalette={() => setPaletteOpen(true)} /> : <div className="h-full pt-12"><ListView /></div>}
          </div>
          <div
            className={cx(
              "shrink-0 border-t border-ink-800 bg-ink-900",
              statsCollapsed ? "" : "scroll-thin max-h-[48vh] overflow-y-auto md:h-[236px] md:max-h-none md:overflow-hidden",
            )}
          >
            <StatsPanel collapsed={statsCollapsed} setCollapsed={setStatsCollapsed} />
          </div>
        </main>

        <div
          className={cx(
            "z-30 w-[min(360px,92vw)] shrink-0 border-l border-ink-800 bg-ink-900 lg:w-[340px]",
            "absolute inset-y-0 right-0 lg:static",
            inspectorOpen ? "anim-slide" : "max-lg:hidden",
          )}
        >
          <Inspector tab={inspectorTab} setTab={setInspectorTab} previewId={previewId} setPreviewId={setPreviewId} onAdd={addComponent} />
        </div>
      </div>

      <ChallengeDrawer
        open={challengesOpen}
        onClose={() => setChallengesOpen(false)}
        onSwitch={requestSwitch}
        onTryAnother={() => {
          setChallengesOpen(false);
          setModal("reset");
        }}
        onFinish={finish}
      />
      <BuildsModal key={`b-${modal === "builds"}`} open={modal === "builds"} onClose={() => setModal(null)} initialTab="save" />
      <BuildsModal key={`s-${modal === "share"}`} open={modal === "share"} onClose={() => setModal(null)} initialTab="share" />
      <CompareModal open={modal === "compare"} onClose={() => setModal(null)} />
      <ProgressModal open={modal === "progress"} onClose={() => setModal(null)} />
      <CompletionModal
        key={completionKey}
        open={modal === "completion"}
        onClose={() => setModal(null)}
        xpGained={completionXp}
        onTryAnother={tryAnother}
        onNext={(id) => switchScenario(id, false)}
      />
      <ConfirmModal
        open={modal === "reset"}
        title="Reset to the challenge baseline?"
        body={`This replaces the canvas with the starting architecture for “${scenario.title}”. You can undo it, and saved builds aren't affected.`}
        confirmLabel="Reset"
        onConfirm={() => {
          dispatch({ type: "reset" });
          setModal(null);
          toast("Reset to the baseline. Undo restores your build.", "info");
        }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal === "switch"}
        title={`Switch to “${pendingScenario ? getScenario(pendingScenario).title : ""}”?`}
        body="Switching replaces the current canvas. Save a copy to your browser-local builds first, or switch without saving."
        confirmLabel="Save copy & switch"
        onConfirm={() => pendingScenario && switchScenario(pendingScenario, true)}
        secondary={{ label: "Switch without saving", onClick: () => pendingScenario && switchScenario(pendingScenario, false) }}
        onCancel={() => {
          setPendingScenario(null);
          setModal(null);
        }}
      />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <WorkbenchProvider>
      <ReactFlowProvider>
        <Workbench />
      </ReactFlowProvider>
    </WorkbenchProvider>
  );
}
