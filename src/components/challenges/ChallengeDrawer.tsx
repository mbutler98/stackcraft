import { Check, CircleCheck, CircleX, Flag, Lightbulb, RotateCcw, Trophy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SCENARIOS } from "../../data/scenarios";
import { useWorkbench } from "../../state/WorkbenchContext";
import { Button, IconButton, SectionLabel, cx } from "../shared/ui";

export function ChallengeDrawer({
  open,
  onClose,
  onSwitch,
  onTryAnother,
  onFinish,
}: {
  open: boolean;
  onClose: () => void;
  onSwitch: (scenarioId: string) => void;
  onTryAnother: () => void;
  onFinish: () => void;
}) {
  const { scenario, evaluation, completion, progress } = useWorkbench();
  const [hintsShown, setHintsShown] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => setHintsShown(0), [scenario.id]);
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
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="challenge-title"
      className="m-0 ml-auto h-full max-h-none w-full max-w-[440px] border-l border-ink-700 bg-ink-900 p-0 text-ink-100 backdrop:bg-black/50"
    >
      {open && (
        <div className="anim-slide flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-ink-800 px-5 py-3.5">
            <h2 id="challenge-title" className="flex items-center gap-2 text-[15px] font-semibold">
              <Flag size={15} className="text-amber-glow" aria-hidden /> Challenges
            </h2>
            <IconButton label="Close challenges" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </header>

          <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-4">
            <nav aria-label="Choose a challenge">
              <ul className="grid gap-1.5">
                {SCENARIOS.map((s) => {
                  const active = s.id === scenario.id;
                  const done = progress.completed.includes(s.id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => !active && onSwitch(s.id)}
                        aria-current={active ? "true" : undefined}
                        className={cx(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                          active ? "border-amber-glow/60 bg-amber-glow/[0.06]" : "border-ink-700 hover:border-ink-500 hover:bg-ink-850",
                        )}
                      >
                        <span
                          className={cx(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px]",
                            done ? "border-good/50 bg-good/10 text-good" : "border-ink-600 text-ink-300",
                          )}
                        >
                          {done ? <Check size={14} aria-label="Completed" /> : s.isSandbox ? "∞" : s.kicker.slice(-1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] text-ink-400">{s.kicker}</span>
                          <span className="block truncate text-[13.5px] font-medium">{s.title}</span>
                        </span>
                        {active && <span className="ml-auto text-[11px] text-amber-glow">Current</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <section>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-amber-glow">{scenario.kicker}</p>
              <h3 className="mt-1 text-[18px] font-semibold tracking-tight">{scenario.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-300">{scenario.description}</p>
              <p className="mt-3 rounded-lg border border-ink-700 bg-ink-850 p-3 text-[13px] leading-relaxed">
                <span className="font-semibold text-ink-100">Objective: </span>
                {scenario.objective}
              </p>
            </section>

            {!scenario.isSandbox && (
              <>
                <section>
                  <SectionLabel>Requirements</SectionLabel>
                  <ul className="space-y-1.5">
                    {evaluation.constraints
                      .filter((c) => c.hard)
                      .map((c) => (
                        <li key={c.id} className="flex gap-2 text-[13px]">
                          {c.status === "pass" ? (
                            <CircleCheck size={15} className="mt-px shrink-0 text-good" aria-label="Met" />
                          ) : (
                            <CircleX size={15} className="mt-px shrink-0 text-bad" aria-label="Not met" />
                          )}
                          <span>
                            {c.label}
                            {c.status !== "pass" && <span className="block text-[11.5px] text-ink-400">{c.detail}</span>}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>

                <section>
                  <SectionLabel>Completion checks</SectionLabel>
                  <ul className="space-y-1.5">
                    {completion.checks.map((c) => (
                      <li key={c.label} className="flex gap-2 text-[13px]">
                        {c.ok ? (
                          <CircleCheck size={15} className="mt-px shrink-0 text-good" aria-label="Passing" />
                        ) : (
                          <CircleX size={15} className="mt-px shrink-0 text-ink-500" aria-label="Not yet" />
                        )}
                        <span>
                          {c.label}
                          <span className="block text-[11.5px] text-ink-400">{c.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11.5px] text-ink-500">Rubric: {scenario.rubric.join(" · ")}</p>
                </section>
              </>
            )}

            <section>
              <SectionLabel>Hints</SectionLabel>
              <ol className="space-y-1.5">
                {scenario.hints.slice(0, hintsShown).map((h, i) => (
                  <li key={h} className="anim-pop flex gap-2 rounded-lg border border-ink-800 bg-ink-850 p-2.5 text-[12.5px] leading-relaxed text-ink-200">
                    <Lightbulb size={13} className="mt-0.5 shrink-0 text-amber-glow" aria-hidden />
                    <span>
                      <span className="sr-only">Hint {i + 1}: </span>
                      {h}
                    </span>
                  </li>
                ))}
              </ol>
              {hintsShown < scenario.hints.length ? (
                <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setHintsShown((n) => n + 1)}>
                  <Lightbulb size={13} /> Show a hint ({hintsShown}/{scenario.hints.length})
                </Button>
              ) : (
                <p className="mt-1.5 text-[11.5px] text-ink-500">That's every hint.</p>
              )}
            </section>
          </div>

          <footer className="flex flex-wrap gap-2 border-t border-ink-800 px-5 py-3">
            {!scenario.isSandbox && (
              <Button variant="primary" disabled={!completion.complete} onClick={onFinish} className={cx(completion.complete && "complete-shimmer")}>
                <Trophy size={14} /> {progress.completed.includes(scenario.id) ? "Review debrief" : "Finish challenge"}
              </Button>
            )}
            <Button onClick={onTryAnother}>
              <RotateCcw size={13} /> Try another approach
            </Button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
