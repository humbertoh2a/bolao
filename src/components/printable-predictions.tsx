"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { knockoutStages } from "@/lib/knockout";
import { supabase } from "@/lib/supabase-browser";
import type {
  GroupPositionPrediction,
  KnockoutPrediction,
  Match,
  Prediction,
  Team,
} from "@/lib/types";

type StoredParticipant = { id: string; name: string };
type PredictionDraft = Record<string, Prediction>;
type GroupPositionDraft = Record<string, { first: string; second: string }>;
type KnockoutDraft = Record<string, string[]>;

const participantStorageKey = "bolao:participant";

function matchDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function groupTeams(matches: Match[]) {
  return matches.reduce<Record<string, string[]>>((acc, match) => {
    if (!match.group_name) return acc;
    acc[match.group_name] = Array.from(
      new Set([...(acc[match.group_name] ?? []), match.home_team, match.away_team]),
    ).sort();
    return acc;
  }, {});
}

export function PrintablePredictions() {
  const [participant, setParticipant] = useState<StoredParticipant | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [predictions, setPredictions] = useState<PredictionDraft>({});
  const [groupPositions, setGroupPositions] = useState<GroupPositionDraft>({});
  const [knockoutPredictions, setKnockoutPredictions] = useState<KnockoutDraft>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const groupStageMatches = useMemo(
    () => matches.filter((match) => match.stage === "Fase de grupos"),
    [matches],
  );
  const teamsByGroup = useMemo(() => groupTeams(groupStageMatches), [groupStageMatches]);
  const completion = useMemo(() => {
    const groupMatchesFilled = groupStageMatches.filter((match) => predictions[match.id]).length;
    const groupNames = Object.keys(teamsByGroup);
    const groupPositionsFilled = groupNames.filter((groupName) => {
      const draft = groupPositions[groupName];
      return Boolean(draft?.first && draft?.second && draft.first !== draft.second);
    }).length;
    const knockoutStagesFilled = knockoutStages.filter((stage) => {
      return (knockoutPredictions[stage.key] ?? []).length === stage.limit;
    }).length;
    const total = groupStageMatches.length + groupNames.length + knockoutStages.length;
    const filled = groupMatchesFilled + groupPositionsFilled + knockoutStagesFilled;

    return { filled, total, missing: Math.max(total - filled, 0), isComplete: total > 0 && filled === total };
  }, [groupPositions, groupStageMatches, knockoutPredictions, predictions, teamsByGroup]);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = localStorage.getItem(participantStorageKey);
      if (!stored) {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(stored) as StoredParticipant;
      setParticipant(parsed);
      loadPredictions(parsed.id);
    });
  }, []);

  async function loadPredictions(participantId: string) {
    setLoading(true);
    const [
      { data: matchData, error: matchError },
      { data: teamData },
      { data: predictionData, error: predictionError },
      { data: positionData, error: positionError },
      { data: knockoutData, error: knockoutError },
    ] = await Promise.all([
      supabase.from("matches").select("*").order("match_number", { ascending: true }),
      supabase.from("teams").select("*").order("name", { ascending: true }),
      supabase.from("predictions").select("*").eq("participant_id", participantId),
      supabase.from("group_position_predictions").select("*").eq("participant_id", participantId),
      supabase.from("knockout_predictions").select("*").eq("participant_id", participantId),
    ]);

    setLoading(false);

    if (matchError || predictionError || positionError || knockoutError) {
      setMessage("Nao foi possivel carregar suas apostas.");
      return;
    }

    setMatches((matchData ?? []) as Match[]);
    setTeams((teamData ?? []) as Team[]);
    setPredictions(
      ((predictionData ?? []) as Prediction[]).reduce<PredictionDraft>((acc, prediction) => {
        acc[prediction.match_id] = prediction;
        return acc;
      }, {}),
    );
    setGroupPositions(
      ((positionData ?? []) as GroupPositionPrediction[]).reduce<GroupPositionDraft>((acc, prediction) => {
        const current = acc[prediction.group_name] ?? { first: "", second: "" };
        acc[prediction.group_name] = {
          ...current,
          [prediction.position === 1 ? "first" : "second"]: prediction.team_name,
        };
        return acc;
      }, {}),
    );
    setKnockoutPredictions(
      ((knockoutData ?? []) as KnockoutPrediction[]).reduce<KnockoutDraft>((acc, prediction) => {
        acc[prediction.stage] = [...(acc[prediction.stage] ?? []), prediction.team_name];
        return acc;
      }, {}),
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] px-4 py-6 text-stone-950 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-4xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-sm font-semibold text-emerald-800">
            Voltar ao bolao
          </Link>
          <button
            onClick={() => window.print()}
            disabled={!participant || loading}
            className="h-10 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            Imprimir / salvar PDF
          </button>
        </div>

        <header className="border-b border-stone-200 pb-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Bolao da Copa 2026</p>
          <h1 className="mt-2 text-3xl font-bold">Minhas apostas</h1>
          {participant ? <p className="mt-2 text-lg font-semibold">{participant.name}</p> : null}
          {participant ? (
            <p
              className={`mt-3 w-fit rounded-md px-2 py-1 text-sm font-bold ${
                completion.isComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
              } print:border print:border-stone-300 print:bg-white print:text-stone-950`}
            >
              {completion.isComplete
                ? "Todas as apostas estao preenchidas"
                : `Faltam ${completion.missing} itens para preencher tudo`}
            </p>
          ) : null}
        </header>

        {loading ? <p className="mt-6 text-sm text-stone-500">Carregando apostas...</p> : null}
        {!loading && !participant ? (
          <section className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Entre no bolao primeiro para ver o resumo das suas apostas neste navegador.
          </section>
        ) : null}
        {message ? <p className="mt-6 text-sm font-semibold text-red-700">{message}</p> : null}

        {participant && !loading ? (
          <div className="mt-6 grid gap-8">
            <section>
              <h2 className="mb-3 text-xl font-bold">Fase de grupos</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-300">
                      <th className="py-2 pr-3 font-bold">Jogo</th>
                      <th className="py-2 pr-3 font-bold">Data</th>
                      <th className="py-2 pr-3 font-bold">Palpite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupStageMatches.map((match) => {
                      const prediction = predictions[match.id];
                      return (
                        <tr key={match.id} className="border-b border-stone-100">
                          <td className="py-2 pr-3">
                            {match.home_team} x {match.away_team}
                          </td>
                          <td className="py-2 pr-3 text-stone-600">{matchDateLabel(match.kickoff_at)}</td>
                          <td className="py-2 pr-3 font-semibold">
                            {prediction
                              ? `${prediction.home_score} x ${prediction.away_score}`
                              : "Nao preenchido"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">Classificacao dos grupos</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.keys(teamsByGroup).map((groupName) => {
                  const draft = groupPositions[groupName];
                  return (
                    <div key={groupName} className="rounded-md border border-stone-200 p-3 print:break-inside-avoid">
                      <h3 className="font-bold">Grupo {groupName}</h3>
                      <p className="mt-2 text-sm">1º: {draft?.first || "Nao preenchido"}</p>
                      <p className="text-sm">2º: {draft?.second || "Nao preenchido"}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">Mata-mata</h2>
              <div className="grid gap-3">
                {knockoutStages.map((stage) => {
                  const selected = knockoutPredictions[stage.key] ?? [];
                  return (
                    <div key={stage.key} className="rounded-md border border-stone-200 p-3 print:break-inside-avoid">
                      <h3 className="font-bold">
                        {stage.label} ({selected.length}/{stage.limit})
                      </h3>
                      <p className="mt-2 text-sm">
                        {selected.length > 0 ? selected.join(", ") : "Nao preenchido"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="text-xs text-stone-500">
              Resumo gerado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}.
              {teams.length > 0 ? ` Selecoes carregadas: ${teams.length}.` : ""}
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
