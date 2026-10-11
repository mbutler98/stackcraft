/* eslint-disable react-refresh/only-export-components -- shared helpers live beside their components */
import {
  AppWindow,
  ChartColumn,
  Cloud,
  CreditCard,
  Database,
  GitBranch,
  HardDrive,
  KeyRound,
  Mail,
  Activity,
  Search,
  ShieldCheck,
  Timer,
  Zap,
  Rows3,
  type LucideIcon,
} from "lucide-react";
import type { ComponentCategory } from "../../types";

export const CATEGORY_ICONS: Record<ComponentCategory, LucideIcon> = {
  frontend: AppWindow,
  hosting: Cloud,
  database: Database,
  cache: Zap,
  storage: HardDrive,
  authentication: KeyRound,
  billing: CreditCard,
  email: Mail,
  jobs: Timer,
  analytics: ChartColumn,
  observability: Activity,
  search: Search,
  workflow: GitBranch,
  queue: Rows3,
  security: ShieldCheck,
};

/** Each category gets a muted hue so the canvas reads at a glance (always paired with an icon and label). */
export const CATEGORY_HUES: Record<ComponentCategory, string> = {
  frontend: "#93c5fd",
  hosting: "#a5b4fc",
  database: "#f5b83d",
  cache: "#fca5a5",
  storage: "#fdba74",
  authentication: "#86efac",
  billing: "#6ee7b7",
  email: "#7dd3fc",
  jobs: "#c4b5fd",
  analytics: "#f9a8d4",
  observability: "#5eead4",
  search: "#fcd34d",
  workflow: "#cbd5e1",
  queue: "#d8b4fe",
  security: "#bef264",
};

export function CategoryIcon({ category, size = 16 }: { category: ComponentCategory; size?: number }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon size={size} color={CATEGORY_HUES[category]} aria-hidden strokeWidth={1.8} />;
}
