import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { getComponent } from "../data/components";
import { getScenario } from "../data/scenarios";
import type { Build, Decisions, Dimension, Workload } from "../types";

export type ComponentNodeData = { componentId: string; label?: string };
export type ComponentNode = Node<ComponentNodeData, "component">;
export type StackEdge = Edge;

export type Snapshot = { nodes: ComponentNode[]; edges: StackEdge[]; decisions: Decisions };

export type WorkbenchState = {
  scenarioId: string;
  name: string;
  weights: Record<Dimension, number>;
  workload: Omit<Workload, "hiddenUntilMonitored">;
  present: Snapshot;
  past: Snapshot[];
  future: Snapshot[];
  /** Human description of the last structural change, for the delta feed. */
  lastAction: string;
  /** Incremented on structural changes (not on drags/selection). */
  revision: number;
  /** Incremented whenever a whole new graph is loaded, so the canvas can re-fit its view. */
  loadCount: number;
  /** Snapshot captured when a drag starts; committed to history if anything moved. */
  dragOrigin?: Snapshot;
};

export type Action =
  | { type: "loadScenario"; scenarioId: string }
  | { type: "loadBuild"; build: Build; action?: string }
  | { type: "nodesChange"; changes: NodeChange<ComponentNode>[] }
  | { type: "edgesChange"; changes: EdgeChange<StackEdge>[] }
  | { type: "connect"; connection: Connection }
  | { type: "reconnect"; oldEdge: StackEdge; connection: Connection }
  | { type: "addNode"; componentId: string; position: { x: number; y: number } }
  | { type: "duplicateNodes"; ids: string[] }
  | { type: "deleteNodes"; ids: string[] }
  | { type: "deleteEdge"; id: string }
  | { type: "deleteSelection" }
  | { type: "renameNode"; id: string; label: string }
  | { type: "select"; ids: string[] }
  | { type: "setDecision"; key: keyof Decisions; value: string }
  | { type: "setWeights"; weights: Record<Dimension, number> }
  | { type: "setWorkload"; workload: Omit<Workload, "hiddenUntilMonitored"> }
  | { type: "setName"; name: string }
  | { type: "dragStart" }
  | { type: "dragStop" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset" };

const HISTORY_LIMIT = 80;

let idCounter = 0;
export function newId(prefix: string) {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function toRfNodes(build: Pick<Build, "nodes">): ComponentNode[] {
  return build.nodes.map((n) => ({
    id: n.id,
    type: "component",
    position: { ...n.position },
    data: { componentId: n.componentId, label: n.label },
  }));
}

function toRfEdges(build: Pick<Build, "edges">): StackEdge[] {
  return build.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "stack" }));
}

export function initialState(scenarioId: string): WorkbenchState {
  const s = getScenario(scenarioId);
  return {
    scenarioId: s.id,
    name: s.isSandbox ? "Untitled sandbox build" : `${s.title} — my build`,
    weights: { ...s.targetWeights },
    workload: { ...s.workload, signals: { ...s.workload.signals } },
    present: {
      nodes: toRfNodes(s.baselineGraph),
      edges: toRfEdges(s.baselineGraph),
      decisions: { ...s.baselineDecisions },
    },
    past: [],
    future: [],
    lastAction: `Started “${s.title}”`,
    revision: 0,
    loadCount: 0,
  };
}

export function stateFromBuild(build: Build): WorkbenchState {
  const base = initialState(build.scenarioId);
  return {
    ...base,
    name: build.name,
    weights: build.weights ? { ...build.weights } : base.weights,
    workload: build.workload && getScenario(build.scenarioId).isSandbox ? build.workload : base.workload,
    present: { nodes: toRfNodes(build), edges: toRfEdges(build), decisions: { ...build.decisions } },
    lastAction: `Loaded “${build.name}”`,
  };
}

export function toBuild(state: WorkbenchState): Build {
  const scenario = getScenario(state.scenarioId);
  return {
    version: 1,
    name: state.name.trim() || "Untitled build",
    scenarioId: state.scenarioId,
    nodes: state.present.nodes.map((n) => ({
      id: n.id,
      componentId: n.data.componentId,
      ...(n.data.label ? { label: n.data.label } : {}),
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: state.present.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    decisions: { ...state.present.decisions },
    weights: { ...state.weights },
    ...(scenario.isSandbox ? { workload: state.workload } : {}),
  };
}

function stripSelection(s: Snapshot): Snapshot {
  return {
    ...s,
    nodes: s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
  };
}

/** Records the current snapshot in history and applies `next`. */
function commit(state: WorkbenchState, next: Snapshot, lastAction: string): WorkbenchState {
  return {
    ...state,
    past: [...state.past, stripSelection(state.present)].slice(-HISTORY_LIMIT),
    future: [],
    present: next,
    lastAction,
    revision: state.revision + 1,
  };
}

function nodeName(nodes: ComponentNode[], id: string) {
  const n = nodes.find((x) => x.id === id);
  if (!n) return "component";
  return n.data.label || getComponent(n.data.componentId)?.name || "component";
}

function removeNodes(snapshot: Snapshot, ids: Set<string>): Snapshot {
  return {
    ...snapshot,
    nodes: snapshot.nodes.filter((n) => !ids.has(n.id)),
    edges: snapshot.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
  };
}

function edgeExists(edges: StackEdge[], a: string, b: string) {
  return edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
}

export function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  const { present } = state;
  switch (action.type) {
    case "loadScenario":
      return { ...initialState(action.scenarioId), loadCount: state.loadCount + 1 };

    case "loadBuild":
      return {
        ...stateFromBuild(action.build),
        lastAction: action.action ?? `Loaded “${action.build.name}”`,
        loadCount: state.loadCount + 1,
      };

    case "reset": {
      const fresh = initialState(state.scenarioId);
      return {
        ...commit({ ...state, weights: fresh.weights, workload: fresh.workload }, fresh.present, "Reset to the challenge baseline"),
        loadCount: state.loadCount + 1,
      };
    }

    case "nodesChange": {
      const removals = action.changes.filter((c) => c.type === "remove").map((c) => (c as { id: string }).id);
      if (removals.length > 0) {
        const ids = new Set(removals);
        const label = removals.length === 1 ? `Removed ${nodeName(present.nodes, removals[0])}` : `Removed ${removals.length} components`;
        const rest = action.changes.filter((c) => c.type !== "remove");
        const next = removeNodes({ ...present, nodes: applyNodeChanges(rest, present.nodes) }, ids);
        return commit(state, next, label);
      }
      return { ...state, present: { ...present, nodes: applyNodeChanges(action.changes, present.nodes) } };
    }

    case "edgesChange": {
      const removals = action.changes.filter((c) => c.type === "remove");
      const nextEdges = applyEdgeChanges(action.changes, present.edges);
      if (removals.length > 0) return commit(state, { ...present, edges: nextEdges }, "Removed a connection");
      return { ...state, present: { ...present, edges: nextEdges } };
    }

    case "connect": {
      const { source, target } = action.connection;
      if (!source || !target || source === target || edgeExists(present.edges, source, target)) return state;
      const edge: StackEdge = { id: newId("e"), source, target, type: "stack" };
      return commit(
        state,
        { ...present, edges: [...present.edges, edge] },
        `Connected ${nodeName(present.nodes, source)} ↔ ${nodeName(present.nodes, target)}`,
      );
    }

    case "reconnect": {
      const { source, target } = action.connection;
      if (!source || !target || source === target) return state;
      const others = present.edges.filter((e) => e.id !== action.oldEdge.id);
      if (edgeExists(others, source, target)) return state;
      const edges = present.edges.map((e) => (e.id === action.oldEdge.id ? { ...e, source, target } : e));
      return commit(state, { ...present, edges }, `Reconnected ${nodeName(present.nodes, source)} ↔ ${nodeName(present.nodes, target)}`);
    }

    case "addNode": {
      const component = getComponent(action.componentId);
      if (!component) return state;
      const node: ComponentNode = {
        id: newId("n"),
        type: "component",
        position: action.position,
        data: { componentId: component.id },
        selected: true,
      };
      const nodes = present.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
      return commit(state, { ...present, nodes: [...nodes, node] }, `Added ${component.name}`);
    }

    case "duplicateNodes": {
      const sources = present.nodes.filter((n) => action.ids.includes(n.id));
      if (sources.length === 0) return state;
      const copies = sources.map((n) => ({
        ...n,
        id: newId("n"),
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: true,
        data: { ...n.data },
      }));
      const nodes = present.nodes.map((n) => (n.selected ? { ...n, selected: false } : n));
      return commit(
        state,
        { ...present, nodes: [...nodes, ...copies] },
        sources.length === 1 ? `Duplicated ${nodeName(present.nodes, sources[0].id)}` : `Duplicated ${sources.length} components`,
      );
    }

    case "deleteNodes": {
      if (action.ids.length === 0) return state;
      const label = action.ids.length === 1 ? `Removed ${nodeName(present.nodes, action.ids[0])}` : `Removed ${action.ids.length} components`;
      return commit(state, removeNodes(present, new Set(action.ids)), label);
    }

    case "deleteSelection": {
      const nodeIds = present.nodes.filter((n) => n.selected).map((n) => n.id);
      const edgeIds = new Set(present.edges.filter((e) => e.selected).map((e) => e.id));
      if (nodeIds.length === 0 && edgeIds.size === 0) return state;
      const next = removeNodes({ ...present, edges: present.edges.filter((e) => !edgeIds.has(e.id)) }, new Set(nodeIds));
      const label =
        nodeIds.length === 1
          ? `Removed ${nodeName(present.nodes, nodeIds[0])}`
          : nodeIds.length > 1
            ? `Removed ${nodeIds.length} components`
            : edgeIds.size === 1
              ? "Removed a connection"
              : `Removed ${edgeIds.size} connections`;
      return commit(state, next, label);
    }

    case "deleteEdge":
      return commit(state, { ...present, edges: present.edges.filter((e) => e.id !== action.id) }, "Removed a connection");

    case "renameNode": {
      const label = action.label.slice(0, 60);
      const nodes = present.nodes.map((n) => (n.id === action.id ? { ...n, data: { ...n.data, label: label || undefined } } : n));
      return { ...state, present: { ...present, nodes }, revision: state.revision + 1, lastAction: "Renamed a component" };
    }

    case "select": {
      const ids = new Set(action.ids);
      return {
        ...state,
        present: {
          ...present,
          nodes: present.nodes.map((n) => ({ ...n, selected: ids.has(n.id) })),
          edges: present.edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
        },
      };
    }

    case "setDecision":
      return commit(
        state,
        { ...present, decisions: { ...present.decisions, [action.key]: action.value } },
        "Changed a design decision",
      );

    case "setWeights":
      return { ...state, weights: action.weights, revision: state.revision + 1, lastAction: "Changed priorities" };

    case "setWorkload":
      return { ...state, workload: action.workload, revision: state.revision + 1, lastAction: "Changed the workload" };

    case "setName":
      return { ...state, name: action.name };

    case "dragStart":
      return { ...state, dragOrigin: stripSelection(present) };

    case "dragStop": {
      const origin = state.dragOrigin;
      if (!origin) return state;
      const moved = present.nodes.some((n) => {
        const before = origin.nodes.find((o) => o.id === n.id);
        return before && (before.position.x !== n.position.x || before.position.y !== n.position.y);
      });
      if (!moved) return { ...state, dragOrigin: undefined };
      return {
        ...state,
        dragOrigin: undefined,
        past: [...state.past, origin].slice(-HISTORY_LIMIT),
        future: [],
      };
    }

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        past: state.past.slice(0, -1),
        future: [stripSelection(present), ...state.future],
        present: prev,
        lastAction: "Undo",
        revision: state.revision + 1,
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        past: [...state.past, stripSelection(present)],
        future: state.future.slice(1),
        present: next,
        lastAction: "Redo",
        revision: state.revision + 1,
      };
    }
  }
}
