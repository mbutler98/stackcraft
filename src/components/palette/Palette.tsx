import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORY_LABELS, CATEGORY_ORDER, COMPONENTS } from "../../data/components";
import { useWorkbench } from "../../state/WorkbenchContext";
import { CategoryIcon } from "../shared/CategoryIcon";
import { cx } from "../shared/ui";

export const DRAG_MIME = "application/x-stackcraft-component";

export function Palette({ onAdd, onInspect }: { onAdd: (componentId: string) => void; onInspect: (componentId: string) => void }) {
  const { state } = useWorkbench();
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of state.present.nodes) m.set(n.data.componentId, (m.get(n.data.componentId) ?? 0) + 1);
    return m;
  }, [state.present.nodes]);

  const q = query.trim().toLowerCase();
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: COMPONENTS.filter(
      (c) =>
        c.category === cat &&
        (!q ||
          [c.name, c.vendor, c.role, CATEGORY_LABELS[c.category], ...c.bestFor].some((s) => s.toLowerCase().includes(q))),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Component palette" className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-800 p-3">
        <label className="relative block">
          <span className="sr-only">Search components</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 25 components…"
            className="h-8 w-full rounded-lg border border-ink-700 bg-ink-850 pl-8 pr-8 text-[13px] text-ink-100 placeholder:text-ink-400 focus:border-amber-glow/60 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-100"
            >
              <X size={13} />
            </button>
          )}
        </label>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-400">
          Drag onto the canvas, or press <kbd className="rounded border border-ink-600 px-1 font-mono text-[10px]">+</kbd> to add.
        </p>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-1">
        {groups.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-ink-400">No components match “{query}”.</p>}
        {groups.map(({ cat, items }) => (
          <section key={cat} className="mt-3" aria-labelledby={`cat-${cat}`}>
            <h3 id={`cat-${cat}`} className="mb-1 px-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-400">
              {CATEGORY_LABELS[cat]}
            </h3>
            <ul className="space-y-0.5">
              {items.map((c) => {
                const count = counts.get(c.id) ?? 0;
                return (
                  <li key={c.id}>
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_MIME, c.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="group flex cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-ink-700 hover:bg-ink-850 active:cursor-grabbing"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-700 bg-ink-900">
                        <CategoryIcon category={c.category} size={14} />
                      </span>
                      <button
                        type="button"
                        onClick={() => onInspect(c.id)}
                        className="min-w-0 flex-1 text-left"
                        title={`Learn about ${c.name}`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-ink-100">{c.name}</span>
                          {count > 0 && (
                            <span
                              className="rounded bg-amber-glow/12 px-1 font-mono text-[10px] text-amber-glow"
                              aria-label={`${count} on canvas`}
                            >
                              ×{count}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-400">{c.role}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdd(c.id)}
                        aria-label={`Add ${c.name} to canvas`}
                        title={`Add ${c.name} to canvas`}
                        className={cx(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors",
                          "hover:bg-amber-glow hover:text-ink-950 focus-visible:bg-amber-glow focus-visible:text-ink-950",
                          "opacity-60 group-hover:opacity-100",
                        )}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="mx-2 mt-5 text-[11px] leading-relaxed text-ink-500">
          An educational seed set — not an exhaustive or ranked list. Pricing models and features change; each component links to official sources.
        </p>
      </div>
    </nav>
  );
}
