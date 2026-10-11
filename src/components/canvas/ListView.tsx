import { ArrowLeftRight, Copy, Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { getComponent } from "../../data/components";
import { areCompatible } from "../../engine/validation";
import { track } from "../../lib/analytics";
import { useWorkbench } from "../../state/WorkbenchContext";
import { CategoryIcon } from "../shared/CategoryIcon";
import { Button, IconButton, SectionLabel, cx } from "../shared/ui";

/** Accessible, list-based architecture editing (keyboard and small screens). */
export function ListView() {
  const { state, dispatch, evaluation } = useWorkbench();
  const { nodes, edges } = state.present;
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  const name = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return "Missing component";
    return n.data.label || getComponent(n.data.componentId)?.name || n.data.componentId;
  };

  const ca = nodes.find((n) => n.id === a);
  const cb = nodes.find((n) => n.id === b);
  const compA = ca && getComponent(ca.data.componentId);
  const compB = cb && getComponent(cb.data.componentId);
  const incompatible = compA && compB && !areCompatible(compA, compB);

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <section aria-labelledby="list-components">
          <SectionLabel>
            <span id="list-components">Components ({nodes.length})</span>
          </SectionLabel>
          {nodes.length === 0 && <p className="text-[13px] text-ink-400">No components yet. Add some from the palette.</p>}
          <ul className="space-y-1.5">
            {nodes.map((n) => {
              const c = getComponent(n.data.componentId);
              return (
                <li
                  key={n.id}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border bg-ink-900 px-2.5 py-2",
                    n.selected ? "border-amber-glow" : "border-ink-700",
                  )}
                >
                  {c && <CategoryIcon category={c.category} size={15} />}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => dispatch({ type: "select", ids: [n.id] })}
                    aria-pressed={!!n.selected}
                  >
                    <span className="block truncate text-[13px] font-medium">{name(n.id)}</span>
                    <span className="block truncate text-[11.5px] text-ink-400">{c?.role}</span>
                  </button>
                  <IconButton label={`Duplicate ${name(n.id)}`} onClick={() => dispatch({ type: "duplicateNodes", ids: [n.id] })}>
                    <Copy size={14} />
                  </IconButton>
                  <IconButton label={`Delete ${name(n.id)}`} onClick={() => dispatch({ type: "deleteNodes", ids: [n.id] })}>
                    <Trash2 size={14} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="list-connections">
          <SectionLabel>
            <span id="list-connections">Connections ({edges.length})</span>
          </SectionLabel>
          <form
            className="mb-3 rounded-lg border border-ink-700 bg-ink-900 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!a || !b || a === b) return;
              dispatch({ type: "connect", connection: { source: a, target: b, sourceHandle: null, targetHandle: null } });
              track("connection_created");
              setB("");
            }}
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="sr-only" htmlFor="conn-a">
                From component
              </label>
              <select
                id="conn-a"
                value={a}
                onChange={(e) => setA(e.target.value)}
                className="h-8 min-w-0 rounded-md border border-ink-700 bg-ink-850 px-2 text-[13px]"
              >
                <option value="">Choose…</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {name(n.id)}
                  </option>
                ))}
              </select>
              <ArrowLeftRight size={14} className="text-ink-400" aria-hidden />
              <label className="sr-only" htmlFor="conn-b">
                To component
              </label>
              <select
                id="conn-b"
                value={b}
                onChange={(e) => setB(e.target.value)}
                className="h-8 min-w-0 rounded-md border border-ink-700 bg-ink-850 px-2 text-[13px]"
              >
                <option value="">Choose…</option>
                {nodes
                  .filter((n) => n.id !== a)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {name(n.id)}
                    </option>
                  ))}
              </select>
            </div>
            {incompatible && (
              <p className="mt-2 text-[12px] text-warn" role="status">
                {compA.name} and {compB.name} don't usually connect directly — the connection would be ignored for scoring.
              </p>
            )}
            <Button type="submit" size="sm" className="mt-2 w-full" disabled={!a || !b || a === b}>
              <Link2 size={13} /> Connect
            </Button>
          </form>
          <ul className="space-y-1.5">
            {edges.map((e) => {
              const issue = evaluation.edgeIssues.find((i) => i.edgeId === e.id);
              return (
                <li key={e.id} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 text-[13px]">
                    {name(e.source)} <span className="text-ink-400">↔</span> {name(e.target)}
                    {issue && <span className="block text-[11.5px] text-bad">{issue.message}</span>}
                  </span>
                  <IconButton label={`Remove connection ${name(e.source)} to ${name(e.target)}`} onClick={() => dispatch({ type: "deleteEdge", id: e.id })}>
                    <Trash2 size={14} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
