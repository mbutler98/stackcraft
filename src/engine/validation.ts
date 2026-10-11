import { getComponent } from "../data/components";
import type { ArchitectureComponent, BuildEdge, BuildNode, Capability, EdgeIssue } from "../types";

/** Two components can be wired together if either lists the other's category. */
export function areCompatible(a: ArchitectureComponent, b: ArchitectureComponent): boolean {
  return a.compatibleConnections.includes(b.category) || b.compatibleConnections.includes(a.category);
}

export type GraphContext = {
  nodes: BuildNode[];
  /** Nodes whose componentId exists in the catalog. */
  knownNodes: { node: BuildNode; component: ArchitectureComponent }[];
  unknownNodes: BuildNode[];
  validEdges: BuildEdge[];
  edgeIssues: EdgeIssue[];
  /** Undirected adjacency over valid edges. */
  neighbors: Map<string, Set<string>>;
  /** Node ids considered "in the architecture" (connected, or the only node). */
  activeNodeIds: Set<string>;
};

/**
 * Validates edges and builds the graph context the scoring engine works on.
 * Invalid edges are reported and ignored — they never contribute to scores.
 */
export function buildGraphContext(nodes: BuildNode[], edges: BuildEdge[]): GraphContext {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const knownNodes: GraphContext["knownNodes"] = [];
  const unknownNodes: BuildNode[] = [];
  for (const node of nodes) {
    const component = getComponent(node.componentId);
    if (component) knownNodes.push({ node, component });
    else unknownNodes.push(node);
  }

  const edgeIssues: EdgeIssue[] = [];
  const validEdges: BuildEdge[] = [];
  const seenPairs = new Set<string>();

  for (const edge of edges) {
    const s = byId.get(edge.source);
    const t = byId.get(edge.target);
    if (!s || !t) {
      edgeIssues.push({
        edgeId: edge.id,
        kind: "missing-node",
        message: `Connection ${edge.id} points to a component that isn't on the canvas.`,
      });
      continue;
    }
    if (edge.source === edge.target) {
      edgeIssues.push({ edgeId: edge.id, kind: "self-loop", message: "A component can't connect to itself." });
      continue;
    }
    const pairKey = [edge.source, edge.target].sort().join("::");
    if (seenPairs.has(pairKey)) {
      edgeIssues.push({ edgeId: edge.id, kind: "duplicate", message: "These two components are already connected." });
      continue;
    }
    const sc = getComponent(s.componentId);
    const tc = getComponent(t.componentId);
    if (!sc || !tc) {
      edgeIssues.push({ edgeId: edge.id, kind: "missing-node", message: "Connection references an unknown component type." });
      continue;
    }
    if (!areCompatible(sc, tc)) {
      edgeIssues.push({
        edgeId: edge.id,
        kind: "incompatible",
        message: `${sc.name} and ${tc.name} don't talk to each other directly in a typical architecture. This connection is ignored for scoring.`,
      });
      continue;
    }
    seenPairs.add(pairKey);
    validEdges.push(edge);
  }

  const neighbors = new Map<string, Set<string>>();
  for (const n of nodes) neighbors.set(n.id, new Set());
  for (const e of validEdges) {
    neighbors.get(e.source)!.add(e.target);
    neighbors.get(e.target)!.add(e.source);
  }

  const activeNodeIds = new Set<string>();
  if (knownNodes.length === 1) {
    activeNodeIds.add(knownNodes[0].node.id);
  } else {
    for (const { node } of knownNodes) {
      if ((neighbors.get(node.id)?.size ?? 0) > 0) activeNodeIds.add(node.id);
    }
  }

  return { nodes, knownNodes, unknownNodes, validEdges, edgeIssues, neighbors, activeNodeIds };
}

/** Capabilities a component satisfies (primary plus bundled). */
export function capabilitiesOf(component: ArchitectureComponent): Capability[] {
  return [...component.provides, ...(component.alsoCovers ?? []).map((c) => c.capability)];
}

/** Active components that provide a capability (primary or bundled). */
export function activeProviders(ctx: GraphContext, capability: Capability) {
  return ctx.knownNodes.filter(
    ({ node, component }) => ctx.activeNodeIds.has(node.id) && capabilitiesOf(component).includes(capability),
  );
}

export function hasActive(ctx: GraphContext, capability: Capability): boolean {
  return activeProviders(ctx, capability).length > 0;
}

/** Any provider on the canvas, connected or not. */
export function anyProviders(ctx: GraphContext, capability: Capability) {
  return ctx.knownNodes.filter(({ component }) => capabilitiesOf(component).includes(capability));
}

/** True if node `a` is directly connected to some node providing `capability`. */
export function connectedTo(ctx: GraphContext, nodeId: string, capability: Capability): boolean {
  const ns = ctx.neighbors.get(nodeId);
  if (!ns) return false;
  for (const id of ns) {
    const entry = ctx.knownNodes.find((k) => k.node.id === id);
    if (entry && capabilitiesOf(entry.component).includes(capability)) return true;
  }
  return false;
}
