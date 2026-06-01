import type { KnockoutStage } from "@/lib/types";

export const predictionLockAt = "2026-06-11T19:00:00.000Z";

export const knockoutStages: Array<{
  key: KnockoutStage;
  label: string;
  limit: number;
  points: number;
}> = [
  { key: "round_of_32", label: "16 avos", limit: 32, points: 5 },
  { key: "round_of_16", label: "Oitavas", limit: 16, points: 7 },
  { key: "quarter_finals", label: "Quartas", limit: 8, points: 9 },
  { key: "semi_finals", label: "Semifinais", limit: 4, points: 12 },
  { key: "finalists", label: "Finalistas", limit: 2, points: 16 },
  { key: "champion", label: "Campeao", limit: 1, points: 25 },
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
