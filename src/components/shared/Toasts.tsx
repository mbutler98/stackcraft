import { CircleAlert, CircleCheck, Info, Sparkles, X } from "lucide-react";
import { useWorkbench } from "../../state/WorkbenchContext";
import { Button, Modal, cx } from "./ui";

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert, xp: Sparkles };
const TONES = {
  info: "text-info",
  success: "text-good",
  error: "text-bad",
  xp: "text-amber-glow",
};

export function Toasts() {
  const { toasts, dismissToast } = useWorkbench();
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed right-4 top-14 z-50 flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            className="anim-pop pointer-events-auto flex items-start gap-2.5 rounded-xl border border-ink-700 bg-ink-850/95 px-3.5 py-2.5 text-[13px] shadow-xl backdrop-blur"
          >
            <Icon size={15} className={cx("mt-0.5 shrink-0", TONES[t.tone])} aria-hidden />
            <span className="flex-1 leading-snug">{t.text}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismissToast(t.id)} className="text-ink-400 hover:text-ink-100">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  secondary,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          {secondary && <Button onClick={secondary.onClick}>{secondary.label}</Button>}
          <Button variant="primary" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-200">{body}</p>
    </Modal>
  );
}
