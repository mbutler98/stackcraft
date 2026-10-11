import type { Progress } from "../persistence/builds";

/**
 * Learning-focused XP. Pure functions: XP comes from completing challenges
 * (which require constraint satisfaction, not component count), reading
 * explanations, and answering reflection prompts correctly.
 */

export const XP = {
  challengeComplete: 100,
  explanationRead: 5,
  explanationCap: 20,
  reflectionCorrect: 25,
} as const;

export type Badge = { id: string; name: string; description: string };

export const BADGES: Badge[] = [
  { id: "mvp-architect", name: "MVP Architect", description: "Completed “Launch your first SaaS” without unjustified infrastructure." },
  { id: "boundary-keeper", name: "Boundary Keeper", description: "Completed “Collaborative workspace” with a real authorization strategy." },
  { id: "scale-without-panic", name: "Scale Without Panic", description: "Measured first, then fixed only the bottlenecks you found." },
  { id: "tradeoff-thinker", name: "Trade-off Thinker", description: "Answered 2 reflections correctly and read 8 score explanations." },
];

export const CHALLENGE_BADGE: Record<string, string> = {
  "launch-first-saas": "mvp-architect",
  "collaborative-workspace": "boundary-keeper",
  "growth-without-overengineering": "scale-without-panic",
};

const LEVEL_TITLES = ["Intern", "Junior Architect", "Architect", "Senior Architect", "Staff Architect", "Principal Architect"];
const XP_PER_LEVEL = 150;

export function levelFor(xp: number) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    intoLevel: xp % XP_PER_LEVEL,
    perLevel: XP_PER_LEVEL,
  };
}

function withBadges(p: Progress): Progress {
  const badges = new Set(p.badges);
  for (const id of p.completed) if (CHALLENGE_BADGE[id]) badges.add(CHALLENGE_BADGE[id]);
  if (p.reflectionsCorrect.length >= 2 && p.explanationsRead.length >= 8) badges.add("tradeoff-thinker");
  return { ...p, badges: BADGES.map((b) => b.id).filter((id) => badges.has(id)) };
}

export function awardCompletion(p: Progress, scenarioId: string): { progress: Progress; gained: number } {
  if (p.completed.includes(scenarioId)) return { progress: p, gained: 0 };
  return {
    progress: withBadges({ ...p, xp: p.xp + XP.challengeComplete, completed: [...p.completed, scenarioId] }),
    gained: XP.challengeComplete,
  };
}

export function awardExplanationRead(p: Progress, ruleId: string): { progress: Progress; gained: number } {
  if (p.explanationsRead.includes(ruleId)) return { progress: p, gained: 0 };
  const gained = p.explanationsRead.length < XP.explanationCap ? XP.explanationRead : 0;
  return {
    progress: withBadges({ ...p, xp: p.xp + gained, explanationsRead: [...p.explanationsRead, ruleId] }),
    gained,
  };
}

/** Only the first attempt per challenge can earn XP, so guessing doesn't pay. */
export function awardReflection(p: Progress, scenarioId: string, correct: boolean): { progress: Progress; gained: number } {
  if (p.reflectionsAttempted.includes(scenarioId)) return { progress: p, gained: 0 };
  const next: Progress = {
    ...p,
    reflectionsAttempted: [...p.reflectionsAttempted, scenarioId],
    reflectionsCorrect: correct ? [...p.reflectionsCorrect, scenarioId] : p.reflectionsCorrect,
    xp: p.xp + (correct ? XP.reflectionCorrect : 0),
  };
  return { progress: withBadges(next), gained: correct ? XP.reflectionCorrect : 0 };
}
