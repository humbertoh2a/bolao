export type MatchStatus = "scheduled" | "finished";

export type Match = {
  id: string;
  match_number: number;
  stage: string;
  group_name: string | null;
  kickoff_at: string;
  home_team: string;
  away_team: string;
  stadium: string | null;
  source_round: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
};

export type Prediction = {
  id: string;
  participant_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
};

export type RankingRow = {
  participant_id: string;
  participant_name: string;
  total_points: number;
  group_points: number;
  knockout_points: number;
  exact_scores: number;
  detail_scores: number;
  outcome_scores: number;
  knockout_hits: number;
  predictions_count: number;
};

export type Team = {
  name: string;
};

export type Setting = {
  key: string;
  value: string;
};

export type KnockoutStage =
  | "round_of_32"
  | "round_of_16"
  | "quarter_finals"
  | "semi_finals"
  | "finalists"
  | "champion";

export type KnockoutPrediction = {
  id: string;
  participant_id: string;
  stage: KnockoutStage;
  team_name: string;
};

export type KnockoutActual = {
  id: string;
  stage: KnockoutStage;
  team_name: string;
};
