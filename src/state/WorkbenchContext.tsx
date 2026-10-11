import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { getScenario } from "../data/scenarios";
import { diffEvaluations, isEmptyDelta, type ScoreDelta } from "../engine/explanations";
import { awardExplanationRead, BADGES } from "../engine/progress";
import { checkCompletion, evaluate, type CompletionResult } from "../engine/scoring";
import { track } from "../lib/analytics";
import { decodeShareHash, loadAutosave, loadProgress, saveProgress, writeAutosave, type Progress } from "../persistence/builds";
import type { Build, Evaluation, RuleResult, Scenario } from "../types";
import { initialState, reducer, stateFromBuild, toBuild, type Action, type WorkbenchState } from "./workbench";

export type Toast = { id: number; tone: "info" | "success" | "error" | "xp"; text: string };

export type DeltaEntry = { id: number; action: string; delta: ScoreDelta };

type Ctx = {
  state: WorkbenchState;
  dispatch: (a: Action) => void;
  scenario: Scenario;
  build: Build;
  evaluation: Evaluation;
  completion: CompletionResult;
  deltas: DeltaEntry[];
  /** Rules grouped by node id for canvas badges and the inspector. */
  rulesByNode: Map<string, RuleResult[]>;
  progress: Progress;
  setProgress: (p: Progress) => void;
  markExplanationRead: (ruleId: string) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  saveStatus: "saved" | "unsaved" | "unavailable";
};

const WorkbenchContext = createContext<Ctx | null>(null);

function boot(): { state: WorkbenchState; notice?: { text: string; tone: Toast["tone"] } } {
  if (typeof window !== "undefined") {
    const shared = decodeShareHash(window.location.hash);
    if (shared) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (shared.ok) return { state: stateFromBuild(shared.build), notice: { text: `Opened shared build “${shared.build.name}”.`, tone: "success" } };
      return { state: initialState("launch-first-saas"), notice: { text: `Couldn't open the shared link: ${shared.errors[0]}`, tone: "error" } };
    }
    const saved = loadAutosave();
    if (saved) return { state: { ...stateFromBuild(saved), lastAction: "Restored your last session" } };
  }
  return { state: initialState("launch-first-saas") };
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [bootResult] = useState(boot);
  const [state, rawDispatch] = useReducer(reducer, bootResult.state);
  const [progress, setProgressState] = useState<Progress>(loadProgress);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deltas, setDeltas] = useState<DeltaEntry[]>([]);
  const [saveStatus, setSaveStatus] = useState<Ctx["saveStatus"]>("saved");
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3800);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    if (bootResult.notice) toast(bootResult.notice.text, bootResult.notice.tone);
  }, [bootResult, toast]);

  const dispatch = useCallback((a: Action) => rawDispatch(a), []);
  const scenario = getScenario(state.scenarioId);
  const build = useMemo(() => toBuild(state), [state]);

  // Scores ignore positions, so only recompute on structural changes.
  const structuralKey = useMemo(
    () =>
      JSON.stringify({
        s: state.scenarioId,
        n: state.present.nodes.map((n) => [n.id, n.data.componentId, n.data.label ?? ""]),
        e: state.present.edges.map((e) => [e.id, e.source, e.target]),
        d: state.present.decisions,
        w: state.weights,
        k: scenario.isSandbox ? state.workload : null,
      }),
    [state.scenarioId, state.present.nodes, state.present.edges, state.present.decisions, state.weights, state.workload, scenario.isSandbox],
  );

  const input = useMemo(
    () => ({
      scenario,
      nodes: build.nodes,
      edges: build.edges,
      decisions: build.decisions,
      weights: build.weights,
      workload: build.workload,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structuralKey],
  );
  const evaluation = useMemo(() => evaluate(input), [input]);
  const completion = useMemo(() => checkCompletion(input), [input]);

  // Delta feed: explain what each structural change did.
  const prevEval = useRef<{ evaluation: Evaluation; scenarioId: string } | null>(null);
  const deltaId = useRef(0);
  useEffect(() => {
    const prev = prevEval.current;
    prevEval.current = { evaluation, scenarioId: state.scenarioId };
    if (!prev) return;
    if (prev.scenarioId !== state.scenarioId) {
      setDeltas([]);
      return;
    }
    const delta = diffEvaluations(prev.evaluation, evaluation);
    if (isEmptyDelta(delta)) return;
    deltaId.current += 1;
    const entry = { id: deltaId.current, action: state.lastAction, delta };
    setDeltas((d) => [entry, ...d].slice(0, 12));
    // state.lastAction is read at the moment the evaluation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluation]);

  // Autosave the working build locally.
  useEffect(() => {
    setSaveStatus("unsaved");
    const t = window.setTimeout(() => setSaveStatus(writeAutosave(build) ? "saved" : "unavailable"), 400);
    return () => window.clearTimeout(t);
  }, [build]);

  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const setProgress = useCallback(
    (p: Progress) => {
      const prev = progressRef.current;
      progressRef.current = p;
      setProgressState(p);
      saveProgress(p);
      for (const b of BADGES.filter((b) => p.badges.includes(b.id) && !prev.badges.includes(b.id))) {
        toast(`Badge unlocked: ${b.name}`, "xp");
      }
    },
    [toast],
  );

  const markExplanationRead = useCallback(
    (ruleId: string) => {
      const { progress: next, gained } = awardExplanationRead(progressRef.current, ruleId);
      if (next !== progressRef.current) {
        setProgress(next);
        track("score_explanation_opened", { ruleId });
        if (gained > 0) toast(`+${gained} XP for exploring a trade-off`, "xp");
      }
    },
    [setProgress, toast],
  );

  const rulesByNode = useMemo(() => {
    const map = new Map<string, RuleResult[]>();
    for (const r of evaluation.rules) {
      for (const id of r.nodeIds) {
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(r);
      }
    }
    return map;
  }, [evaluation]);

  const value: Ctx = {
    state,
    dispatch,
    scenario,
    build,
    evaluation,
    completion,
    deltas,
    rulesByNode,
    progress,
    setProgress,
    markExplanationRead,
    toasts,
    toast,
    dismissToast,
    saveStatus,
  };
  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkbench(): Ctx {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench must be used inside WorkbenchProvider");
  return ctx;
}
