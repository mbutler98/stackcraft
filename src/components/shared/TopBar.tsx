import {
  Columns2,
  Flag,
  FolderOpen,
  Layers,
  PanelLeft,
  PanelRight,
  Redo2,
  RotateCcw,
  Share2,
  Trophy,
  Undo2,
} from "lucide-react";
import { levelFor } from "../../engine/progress";
import { useWorkbench } from "../../state/WorkbenchContext";
import { Button, IconButton, cx } from "./ui";

export function TopBar({
  onChallenges,
  onBuilds,
  onShare,
  onCompare,
  onReset,
  onProgress,
  onFinish,
  onTogglePalette,
  onToggleInspector,
}: {
  onChallenges: () => void;
  onBuilds: () => void;
  onShare: () => void;
  onCompare: () => void;
  onReset: () => void;
  onProgress: () => void;
  onFinish: () => void;
  onTogglePalette: () => void;
  onToggleInspector: () => void;
}) {
  const { state, dispatch, scenario, saveStatus, progress, completion } = useWorkbench();
  const lvl = levelFor(progress.xp);
  const canFinish = completion.complete;
  const finishedBefore = progress.completed.includes(scenario.id);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-ink-800 bg-ink-900 px-2 sm:gap-2 sm:px-3">
      <IconButton label="Toggle component palette" onClick={onTogglePalette} className="lg:hidden">
        <PanelLeft size={16} />
      </IconButton>

      <div className="flex items-center gap-2 pr-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-glow text-ink-950" aria-hidden>
          <Layers size={15} strokeWidth={2.2} />
        </span>
        <span className="text-[14px] font-semibold tracking-tight max-sm:hidden">Stackcraft</span>
      </div>

      <span className="h-5 w-px bg-ink-700 max-sm:hidden" aria-hidden />

      <button
        type="button"
        onClick={onChallenges}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-ink-800"
        aria-label={`Challenge: ${scenario.title}. Open challenges`}
      >
        <Flag size={14} className="shrink-0 text-amber-glow" aria-hidden />
        <span className="min-w-0">
          <span className="block font-mono text-[9.5px] uppercase leading-none tracking-[0.12em] text-ink-400">{scenario.kicker}</span>
          <span className="block max-w-[34vw] truncate text-[13px] font-medium leading-tight sm:max-w-[260px]">{scenario.title}</span>
        </span>
      </button>

      {canFinish && (
        <Button variant="primary" size="sm" onClick={onFinish} className="complete-shimmer anim-pop">
          <Trophy size={13} /> <span className="max-sm:sr-only">{finishedBefore ? "Debrief" : "Finish challenge"}</span>
        </Button>
      )}

      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <span
          className={cx(
            "mr-1 flex items-center gap-1.5 text-[11.5px] max-md:hidden",
            saveStatus === "unavailable" ? "text-warn" : "text-ink-400",
          )}
          role="status"
          title="Your working build is autosaved in this browser only"
        >
          <span className={cx("h-1.5 w-1.5 rounded-full", saveStatus === "saved" ? "bg-good" : saveStatus === "unsaved" ? "bg-ink-500" : "bg-warn")} aria-hidden />
          {saveStatus === "saved" ? "Saved locally" : saveStatus === "unsaved" ? "Saving…" : "Storage unavailable"}
        </span>
        <IconButton label="Undo (Ctrl+Z)" disabled={state.past.length === 0} onClick={() => dispatch({ type: "undo" })}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" disabled={state.future.length === 0} onClick={() => dispatch({ type: "redo" })}>
          <Redo2 size={16} />
        </IconButton>
        <IconButton label="Reset to challenge baseline" onClick={onReset} className="max-sm:hidden">
          <RotateCcw size={15} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-ink-700 max-sm:hidden" aria-hidden />
        <IconButton label="Compare architectures" onClick={onCompare}>
          <Columns2 size={16} />
        </IconButton>
        <IconButton label="Saved builds" onClick={onBuilds}>
          <FolderOpen size={16} />
        </IconButton>
        <Button size="sm" onClick={onShare} className="max-md:hidden">
          <Share2 size={13} /> Export / share
        </Button>
        <button
          type="button"
          onClick={onProgress}
          className="ml-1 flex items-center gap-2 rounded-lg border border-ink-700 px-2 py-1 hover:border-ink-500"
          aria-label={`Level ${lvl.level} ${lvl.title}, ${progress.xp} XP. Open progress`}
        >
          <span className="font-mono text-[11px] font-semibold text-amber-glow">Lv{lvl.level}</span>
          <span className="block h-1 w-12 overflow-hidden rounded-full bg-ink-700 max-sm:hidden" aria-hidden>
            <span className="bar-fill block h-full bg-amber-glow" style={{ width: `${(lvl.intoLevel / lvl.perLevel) * 100}%` }} />
          </span>
        </button>
        <IconButton label="Toggle inspector" onClick={onToggleInspector} className="lg:hidden">
          <PanelRight size={16} />
        </IconButton>
      </div>
    </header>
  );
}
