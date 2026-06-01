import type { KnockoutStage } from "@/lib/types";

export const predictionLockAt = "2026-06-11T19:00:00.000Z";

export const knockoutStages: Array<{
  key: KnockoutStage;
  label: string;
  limit: number;
  points: number;
}> = [
  { key: "round_of_16", label: "Oitavas", limit: 16, points: 6 },
  { key: "quarter_finals", label: "Quartas", limit: 8, points: 10 },
  { key: "semi_finals", label: "Semifinais", limit: 4, points: 15 },
  { key: "finalists", label: "Finalistas", limit: 2, points: 20 },
  { key: "champion", label: "Campeao", limit: 1, points: 35 },
];

export function isKnockoutStage(value: string): value is KnockoutStage {
  return knockoutStages.some((stage) => stage.key === value);
}

export function getStageLimit(stageKey: KnockoutStage) {
  return knockoutStages.find((stage) => stage.key === stageKey)?.limit ?? 0;
}

export function getStageLabel(stageKey: KnockoutStage) {
  return knockoutStages.find((stage) => stage.key === stageKey)?.label ?? stageKey;
}
