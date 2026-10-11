import { ArrowRight, Award, CircleCheck, CircleX, RotateCcw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { CHALLENGES } from "../../data/scenarios";
import { BADGES, CHALLENGE_BADGE, awardReflection } from "../../engine/progress";
import { DIMENSION_LABELS } from "../../engine/scoring";
import { useWorkbench } from "../../state/WorkbenchContext";
import { DIMENSIONS } from "../../types";
import { Button, EffectPills, Modal, SectionLabel, cx } from "../shared/ui";

const sum = (e: Record<string, number | undefined>) => Object.values(e).reduce<number>((a, b) => a + (b ?? 0), 0);

export function CompletionModal({
  open,
  onClose,
  xpGained,
  onTryAnother,
  onNext,
}: {
  open: boolean;
  onClose: () => void;
  xpGained: number;
  onTryAnother: () => void;
  onNext: (id: string) => void;
}) {
  const { scenario, evaluation, progress, setProgress, toast } = useWorkbench();
  const [answer, setAnswer] = useState<string | null>(null);
  const reflection = scenario.reflection;
  const alreadyAnswered = progress.reflectionsAttempted.includes(scenario.id);

  const decisionRules = evaluation.rules.filter((r) => r.ruleId !== "component-profile" && r.ruleId !== "budget-sensitivity");
  const strongest = [...decisionRules].filter((r) => sum(r.effects) > 0).sort((a, b) => sum(b.effects) - sum(a.effects))[0];
  const weakest = [...evaluation.rules].filter((r) => sum(r.effects) < 0).sort((a, b) => sum(a.effects) - sum(b.effects))[0];
  const nextChallenge = CHALLENGES[CHALLENGES.findIndex((c) => c.id === scenario.id) + 1];
  const badge = BADGES.find((b) => b.id === CHALLENGE_BADGE[scenario.id] && progress.badges.includes(b.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`${scenario.kicker} complete: ${scenario.title}`}
      description="Every requirement met, and every component earns its place."
      footer={
        <>
          <Button onClick={onTryAnother}>
            <RotateCcw size={13} /> Try another approach
          </Button>
          <Button onClick={onClose}>Keep building</Button>
          {nextChallenge && (
            <Button variant="primary" onClick={() => onNext(nextChallenge.id)}>
              Next: {nextChallenge.title} <ArrowRight size={14} />
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <div className="flex items-center gap-4 rounded-xl border border-amber-glow/30 bg-amber-glow/[0.06] p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-glow text-ink-950">
              <Award size={24} aria-hidden />
            </span>
            <div>
              <p className="text-[22px] font-semibold tabular-nums leading-none">Fit {evaluation.weightedFit}</p>
              <p className="mt-1 text-[12.5px] text-ink-300">
                {xpGained > 0 ? `+${xpGained} XP earned` : "Already completed — XP was awarded the first time."}
                {badge && <span className="ml-1 text-amber-glow">· Badge: {badge.name}</span>}
              </p>
            </div>
          </div>

          <section>
            <SectionLabel>Final stats</SectionLabel>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {DIMENSIONS.map((d) => (
                <li key={d} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-ink-300">{DIMENSION_LABELS[d]}</span>
                  <span className="font-mono tabular-nums">{evaluation.scores[d]}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-good">
              <CircleCheck size={13} aria-hidden /> Blockers: none
            </p>
          </section>

          {strongest && (
            <section>
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-good" aria-hidden /> Strongest decision
                </span>
              </SectionLabel>
              <p className="text-[13px] font-medium">{strongest.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">{strongest.why}</p>
              <div className="mt-1.5">
                <EffectPills effects={strongest.effects} size="xs" />
              </div>
            </section>
          )}

          {weakest && (
            <section>
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5">
                  <TrendingDown size={12} className="text-bad" aria-hidden /> Suggested next improvement
                </span>
              </SectionLabel>
              <p className="text-[13px] font-medium">{weakest.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">{weakest.tradeoff}</p>
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section>
            <SectionLabel>Debrief</SectionLabel>
            <p className="text-[13.5px] leading-relaxed text-ink-100">{scenario.debrief}</p>
          </section>

          {reflection && (
            <section className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Sparkles size={14} className="text-amber-glow" aria-hidden /> Reflection
                <span className="ml-auto text-[11px] font-normal text-ink-400">+25 XP on first try</span>
              </h3>
              <fieldset className="mt-2">
                <legend className="text-[13px] leading-relaxed text-ink-200">{reflection.prompt}</legend>
                <div className="mt-2 space-y-1.5">
                  {reflection.options.map((o) => {
                    const chosen = answer === o.id;
                    const reveal = answer !== null;
                    const correct = o.id === reflection.correctId;
                    return (
                      <label
                        key={o.id}
                        className={cx(
                          "flex cursor-pointer gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
                          reveal && correct && "border-good/50 bg-good/[0.07]",
                          reveal && chosen && !correct && "border-bad/50 bg-bad/[0.07]",
                          !reveal && "border-ink-700 hover:bg-ink-800",
                          reveal && !chosen && !correct && "border-ink-800 opacity-70",
                        )}
                      >
                        <input
                          type="radio"
                          name="reflection"
                          disabled={reveal}
                          checked={chosen}
                          onChange={() => {
                            setAnswer(o.id);
                            const res = awardReflection(progress, scenario.id, correct);
                            if (res.progress !== progress) setProgress(res.progress);
                            if (res.gained > 0) toast(`+${res.gained} XP — nice reasoning`, "xp");
                          }}
                          className="mt-0.5 accent-amber-glow"
                        />
                        <span className="flex-1">{o.text}</span>
                        {reveal && correct && <CircleCheck size={14} className="text-good" aria-label="Correct answer" />}
                        {reveal && chosen && !correct && <CircleX size={14} className="text-bad" aria-label="Incorrect" />}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {answer && <p className="anim-pop mt-3 text-[12.5px] leading-relaxed text-ink-200">{reflection.explanation}</p>}
              {alreadyAnswered && !answer && <p className="mt-2 text-[11.5px] text-ink-400">You've answered this before; XP only counts on the first try.</p>}
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
}
