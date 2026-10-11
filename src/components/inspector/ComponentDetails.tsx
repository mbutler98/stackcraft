import { BookOpen, Check, Copy, ExternalLink as ExternalIcon, Lightbulb, Plus, Receipt, Trash2, X } from "lucide-react";
import { CATEGORY_LABELS, getComponent } from "../../data/components";
import { CAPABILITY_LABELS } from "../../data/scenarios";
import { hasActive, buildGraphContext } from "../../engine/validation";
import { useWorkbench } from "../../state/WorkbenchContext";
import type { ComponentNode } from "../../state/workbench";
import { CategoryIcon } from "../shared/CategoryIcon";
import { RuleCard } from "../shared/RuleCard";
import { Button, EffectPills, ExternalLink, SectionLabel } from "../shared/ui";

export function ComponentDetails({
  componentId,
  node,
  onAdd,
  onClosePreview,
}: {
  componentId: string;
  node?: ComponentNode;
  onAdd: (id: string) => void;
  onClosePreview?: () => void;
}) {
  const { dispatch, rulesByNode, build } = useWorkbench();
  const c = getComponent(componentId);
  if (!c) return <p className="p-4 text-[13px] text-bad">Unknown component.</p>;
  const rules = node ? (rulesByNode.get(node.id) ?? []) : [];
  const ctx = node ? buildGraphContext(build.nodes, build.edges) : null;

  return (
    <div className="anim-slide space-y-5 p-4">
      <header>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-850">
            <CategoryIcon category={c.category} size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold leading-tight tracking-tight">{c.name}</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-300">{c.role}</p>
            <p className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-ink-400">
              <span className="rounded border border-ink-700 px-1.5 py-px">{CATEGORY_LABELS[c.category]}</span>
              <span className="rounded border border-ink-700 px-1.5 py-px">{c.vendor}</span>
            </p>
          </div>
          {!node && onClosePreview && (
            <button type="button" onClick={onClosePreview} aria-label="Close preview" className="rounded p-1 text-ink-400 hover:text-ink-100">
              <X size={15} />
            </button>
          )}
        </div>

        {node ? (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-400">Label on canvas (optional)</span>
              <input
                value={node.data.label ?? ""}
                onChange={(e) => dispatch({ type: "renameNode", id: node.id, label: e.target.value })}
                placeholder={c.name}
                maxLength={60}
                className="h-8 w-full rounded-md border border-ink-700 bg-ink-850 px-2 text-[13px] focus:border-amber-glow/60 focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => dispatch({ type: "duplicateNodes", ids: [node.id] })}>
                <Copy size={13} /> Duplicate
              </Button>
              <Button size="sm" variant="danger" onClick={() => dispatch({ type: "deleteNodes", ids: [node.id] })}>
                <Trash2 size={13} /> Delete
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" size="sm" className="mt-3" onClick={() => onAdd(c.id)}>
            <Plus size={14} /> Add to canvas
          </Button>
        )}
      </header>

      <section className="rounded-xl border border-amber-glow/25 bg-amber-glow/[0.06] p-3">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-glow">
          <Lightbulb size={13} aria-hidden /> Why this matters
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-100">{c.whyItMatters}</p>
      </section>

      {node && (
        <section>
          <SectionLabel>In this build</SectionLabel>
          {rules.length === 0 ? (
            <p className="text-[12.5px] text-ink-400">No rules involve this component right now.</p>
          ) : (
            <div className="space-y-1.5">
              {rules.map((r) => (
                <RuleCard key={r.id} rule={r} />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <SectionLabel>What it is</SectionLabel>
        <p className="text-[13px] leading-relaxed text-ink-200">{c.summary}</p>
      </section>

      <div className="grid gap-4">
        <section>
          <SectionLabel>Strengths</SectionLabel>
          <ul className="space-y-1">
            {c.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-[13px] text-ink-200">
                <Check size={13} className="mt-1 shrink-0 text-good" aria-hidden /> {s}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <SectionLabel>Trade-offs</SectionLabel>
          <ul className="space-y-1">
            {c.tradeoffs.map((s) => (
              <li key={s} className="flex gap-2 text-[13px] text-ink-200">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden /> {s}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <SectionLabel>Good fit when</SectionLabel>
        <ul className="list-disc space-y-0.5 pl-4 text-[13px] text-ink-200 marker:text-ink-500">
          {c.bestFor.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      {(c.dependencies.length > 0 || c.alsoCovers) && (
        <section>
          <SectionLabel>Dependencies & overlap</SectionLabel>
          {c.dependencies.length > 0 && (
            <ul className="space-y-1">
              {c.dependencies.map((d) => {
                const ok = ctx ? hasActive(ctx, d) : null;
                return (
                  <li key={d} className="flex items-center gap-2 text-[13px]">
                    {ok === null ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-400" aria-hidden />
                    ) : ok ? (
                      <Check size={13} className="text-good" aria-label="Satisfied" />
                    ) : (
                      <X size={13} className="text-bad" aria-label="Missing" />
                    )}
                    Needs {CAPABILITY_LABELS[d].toLowerCase()}
                  </li>
                );
              })}
            </ul>
          )}
          {c.alsoCovers && (
            <div className="mt-2 rounded-lg border border-ink-700 bg-ink-850 p-2.5 text-[12.5px]">
              <span className="font-medium text-ink-100">Also covers:</span>{" "}
              <span className="text-ink-300">{c.alsoCovers.map((a) => a.note).join("; ")}.</span>
              <span className="mt-1 block text-ink-400">Check these before adding a separate vendor for the same job.</span>
            </div>
          )}
        </section>
      )}

      <section>
        <SectionLabel>Connects with</SectionLabel>
        <p className="text-[12.5px] leading-relaxed text-ink-300">{c.compatibleConnections.map((cat) => CATEGORY_LABELS[cat]).join(" · ")}</p>
      </section>

      <section>
        <SectionLabel>Intrinsic profile (estimate)</SectionLabel>
        <EffectPills effects={c.dimensionEffects} />
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-300">{c.effectRationale}</p>
        <p className="mt-1.5 text-[11.5px] text-ink-400">
          Positive effects apply only when this component fills a need the workload actually has. Costs always apply.
        </p>
      </section>

      <section className="rounded-xl border border-ink-700 bg-ink-850 p-3">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-100">
          <Receipt size={13} aria-hidden /> Pricing model
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-300">{c.pricingModel}</p>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          <ExternalLink href={c.docsUrl} className="inline-flex items-center gap-1">
            <BookOpen size={12} aria-hidden /> Official docs
          </ExternalLink>
          {c.pricingUrl && (
            <ExternalLink href={c.pricingUrl} className="inline-flex items-center gap-1">
              <ExternalIcon size={12} aria-hidden /> Current pricing
            </ExternalLink>
          )}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          General summary based on official docs · catalog dated {c.lastVerified}. Prices and features change — check the source before relying on specifics.
        </p>
      </section>
    </div>
  );
}
