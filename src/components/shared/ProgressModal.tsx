import { Award, Lock } from "lucide-react";
import { CHALLENGES } from "../../data/scenarios";
import { BADGES, XP, levelFor } from "../../engine/progress";
import { useWorkbench } from "../../state/WorkbenchContext";
import { Modal, SectionLabel, cx } from "./ui";

export function ProgressModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { progress } = useWorkbench();
  const lvl = levelFor(progress.xp);
  return (
    <Modal open={open} onClose={onClose} title="Your progress" description="XP rewards learning and sound trade-offs — never component count. Stored in this browser.">
      <div className="space-y-5">
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] font-semibold">
              Level {lvl.level} · <span className="text-amber-glow">{lvl.title}</span>
            </p>
            <p className="font-mono text-[12px] text-ink-300">{progress.xp} XP</p>
          </div>
          <div className="mt-2 h-2 rounded-full bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={lvl.perLevel} aria-valuenow={lvl.intoLevel} aria-label="Progress to next level">
            <div className="bar-fill h-full rounded-full bg-amber-glow" style={{ width: `${(lvl.intoLevel / lvl.perLevel) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-400">{lvl.perLevel - lvl.intoLevel} XP to the next level</p>
        </div>

        <section>
          <SectionLabel>Challenges</SectionLabel>
          <ul className="space-y-1">
            {CHALLENGES.map((c) => (
              <li key={c.id} className="flex justify-between text-[13px]">
                <span>{c.title}</span>
                <span className={progress.completed.includes(c.id) ? "text-good" : "text-ink-500"}>
                  {progress.completed.includes(c.id) ? "Completed" : "Not yet"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionLabel>Badges</SectionLabel>
          <ul className="grid gap-2 sm:grid-cols-2">
            {BADGES.map((b) => {
              const has = progress.badges.includes(b.id);
              return (
                <li key={b.id} className={cx("flex gap-2.5 rounded-lg border p-3", has ? "border-amber-glow/40 bg-amber-glow/[0.06]" : "border-ink-700 opacity-70")}>
                  {has ? <Award size={18} className="shrink-0 text-amber-glow" aria-label="Earned" /> : <Lock size={16} className="shrink-0 text-ink-500" aria-label="Locked" />}
                  <span>
                    <span className="block text-[13px] font-medium">{b.name}</span>
                    <span className="block text-[11.5px] leading-snug text-ink-400">{b.description}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="text-[12px] leading-relaxed text-ink-400">
          <SectionLabel>How XP works</SectionLabel>
          Complete a challenge: +{XP.challengeComplete}. Open a new score explanation: +{XP.explanationRead} (first {XP.explanationCap}). Answer a
          reflection correctly on the first try: +{XP.reflectionCorrect}. Explanations read: {progress.explanationsRead.length}.
        </section>
      </div>
    </Modal>
  );
}
