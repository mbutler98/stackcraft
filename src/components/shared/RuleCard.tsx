import { ChevronRight, CircleCheck, CircleDot, OctagonAlert, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { useWorkbench } from "../../state/WorkbenchContext";
import type { RuleResult } from "../../types";
import { EffectPills, cx } from "./ui";

const SEVERITY = {
  positive: { icon: CircleCheck, cls: "text-good", label: "Helps" },
  neutral: { icon: CircleDot, cls: "text-info", label: "Note" },
  warning: { icon: TriangleAlert, cls: "text-warn", label: "Trade-off" },
  blocker: { icon: OctagonAlert, cls: "text-bad", label: "Blocker" },
} as const;

export function SeverityIcon({ severity, size = 14 }: { severity: RuleResult["severity"]; size?: number }) {
  const s = SEVERITY[severity];
  return <s.icon size={size} className={cx("shrink-0", s.cls)} aria-label={s.label} />;
}

/** One explained rule: what changed, why, the trade-off, and the triggering condition. */
export function RuleCard({ rule, defaultOpen = false, compact = false }: { rule: RuleResult; defaultOpen?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { markExplanationRead } = useWorkbench();
  const panelId = useId();

  return (
    <div className={cx("rounded-lg border border-ink-800 bg-ink-900/60", open && "border-ink-700 bg-ink-850")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markExplanationRead(rule.ruleId);
        }}
        className={cx("flex w-full items-start gap-2 text-left", compact ? "px-2 py-1.5" : "px-2.5 py-2")}
      >
        <span className="mt-0.5">
          <SeverityIcon severity={rule.severity} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium leading-snug text-ink-100">{rule.title}</span>
          <span className="mt-1 block">
            <EffectPills effects={rule.effects} size="xs" />
          </span>
        </span>
        <ChevronRight size={14} className={cx("mt-0.5 shrink-0 text-ink-400 transition-transform", open && "rotate-90")} aria-hidden />
      </button>
      {open && (
        <dl id={panelId} className="anim-pop space-y-2 border-t border-ink-800 px-3 py-2.5 text-[12.5px] leading-relaxed">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">What changed</dt>
            <dd className="text-ink-200">{rule.what}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">Why</dt>
            <dd className="text-ink-100">{rule.why}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">Trade-off</dt>
            <dd className="text-ink-200">{rule.tradeoff}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-400">Triggered by</dt>
            <dd className="text-amber-glow/90">{rule.trigger}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
