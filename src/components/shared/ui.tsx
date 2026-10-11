/* eslint-disable react-refresh/only-export-components -- shared helpers live beside their components */
import { X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { DIMENSIONS, type Dimension } from "../../types";
import { DIMENSION_LABELS } from "../../engine/scoring";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-amber-glow text-ink-950 hover:bg-[#f8c75e] border border-amber-glow font-semibold disabled:opacity-40 disabled:hover:bg-amber-glow",
  secondary: "bg-ink-800 text-ink-100 hover:bg-ink-700 border border-ink-700 disabled:opacity-40",
  ghost: "bg-transparent text-ink-200 hover:bg-ink-800 hover:text-ink-100 border border-transparent disabled:opacity-40",
  danger: "bg-transparent text-bad hover:bg-bad/10 border border-bad/40 disabled:opacity-40",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-[13px]",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Icon-only buttons always carry an accessible name and tooltip. */
export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
      className={cx(
        "m-auto max-h-[88vh] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 p-0 text-ink-100 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-4xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="anim-pop flex max-h-[88vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-ink-800 px-5 py-4">
            <div>
              <h2 id="modal-title" className="text-base font-semibold tracking-tight">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-[13px] text-ink-300">{description}</p>}
            </div>
            <IconButton label="Close dialog" onClick={onClose} className="-mr-1.5 -mt-1">
              <X size={16} />
            </IconButton>
          </header>
          <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-ink-800 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cx("mb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-400", className)}>
      {children}
    </h3>
  );
}

export function EffectPills({ effects, size = "sm" }: { effects: Partial<Record<Dimension, number>>; size?: "sm" | "xs" }) {
  const entries = DIMENSIONS.filter((d) => (effects[d] ?? 0) !== 0);
  if (entries.length === 0) return <span className="text-[11px] text-ink-400">No score effect</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map((d) => {
        const v = effects[d]!;
        return (
          <span
            key={d}
            className={cx(
              "inline-flex items-center gap-1 rounded-md border px-1.5 font-mono tabular-nums",
              size === "xs" ? "py-0 text-[10px]" : "py-0.5 text-[11px]",
              v > 0 ? "border-good/25 bg-good/8 text-good" : "border-bad/25 bg-bad/8 text-bad",
            )}
          >
            <span aria-hidden>{v > 0 ? "▲" : "▼"}</span>
            <span className="sr-only">{v > 0 ? "increases" : "decreases"}</span>
            {DIMENSION_LABELS[d]} {v > 0 ? "+" : ""}
            {v}
          </span>
        );
      })}
    </span>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx("text-amber-glow underline decoration-amber-glow/30 underline-offset-2 hover:decoration-amber-glow", className)}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
