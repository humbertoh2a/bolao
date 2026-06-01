"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { knockoutStages, predictionLockAt } from "@/lib/knockout";
import { supabase } from "@/lib/supabase-browser";
import type { KnockoutPrediction, KnockoutStage, Match, Prediction, RankingRow, Team } from "@/lib/types";

type PredictionDraft = Record<string, { home: string; away: string; saving?: boolean }>;
type KnockoutDraft = Record<KnockoutStage, string[]>;

const participantStorageKey = "bolao:participant";

const emptyKnockoutDraft = knockoutStages.reduce<KnockoutDraft>((acc, stage) => {
  acc[stage.key] = [];
  return acc;
}, {} as KnockoutDraft);

function matchDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function lockDateLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(predictionLockAt));
}

function groupMatches(matches: Match[]) {
  return matches.reduce<Record<string, Match[]>>((acc, match) => {
    const group = match.group_name ? `Grupo ${match.group_name}` : "Sem grupo";
    acc[group] = [...(acc[group] ?? []), match];
    return acc;
  }, {});
}

export function BolaoApp() {
  const [participant, setParticipant] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [drafts, setDrafts] = useState<PredictionDraft>({});
  const [knockoutDrafts, setKnockoutDrafts] = useState<KnockoutDraft>(emptyKnockoutDraft);
  const [savingStage, setSavingStage] = useState<KnockoutStage | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isLocked = Date.now() >= new Date(predictionLockAt).getTime();
  const groupStageMatches = useMemo(
    () => matches.filter((match) => match.stage === "Fase de grupos"),
    [matches],
  );
  const groupedMatches = useMemo(() => groupMatches(groupStageMatches), [groupStageMatches]);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = localStorage.getItem(participantStorageKey);
      if (stored) {
        setParticipant(JSON.parse(stored));
      }
    });
  }, []);

  useEffect(() => {
    loadPublicData();
  }, []);

  useEffect(() => {
    if (participant) {
      loadParticipantPredictions(participant.id);
    }
  }, [participant]);

  async function loadPublicData() {
    setLoading(true);
    const [{ data: matchData, error: matchError }, { data: teamData }, { data: rankingData, error: rankingError }] =
      await Promise.all([
        supabase.from("matches").select("*").order("match_number", { ascending: true }),
        supabase.from("teams").select("*").order("name", { ascending: true }),
        supabase.from("ranking").select("*").order("total_points", { ascending: false }),
      ]);

    if (matchError || rankingError) {
      setMessage("Nao foi possivel carregar os dados. Confira as variaveis do Supabase e as migrations.");
    } else {
      setMatches((matchData ?? []) as Match[]);
      setTeams((teamData ?? []) as Team[]);
      setRanking((rankingData ?? []) as RankingRow[]);
    }
    setLoading(false);
  }

  async function loadParticipantPredictions(participantId: string) {
    const [{ data: groupData, error: groupError }, { data: knockoutData, error: knockoutError }] =
      await Promise.all([
        supabase.from("predictions").select("*").eq("participant_id", participantId),
        supabase.from("knockout_predictions").select("*").eq("participant_id", participantId),
      ]);

    if (groupError || knockoutError) {
      setMessage("Nao foi possivel carregar seus palpites.");
      return;
    }

    const nextDrafts: PredictionDraft = {};
    ((groupData ?? []) as Prediction[]).forEach((prediction) => {
      nextDrafts[prediction.match_id] = {
        home: String(prediction.home_score),
        away: String(prediction.away_score),
      };
    });
    setDrafts(nextDrafts);

    const nextKnockoutDrafts = knockoutStages.reduce<KnockoutDraft>((acc, stage) => {
      acc[stage.key] = [];
      return acc;
    }, {} as KnockoutDraft);

    ((knockoutData ?? []) as KnockoutPrediction[]).forEach((prediction) => {
      nextKnockoutDrafts[prediction.stage] = [
        ...(nextKnockoutDrafts[prediction.stage] ?? []),
        prediction.team_name,
      ];
    });
    setKnockoutDrafts(nextKnockoutDrafts);
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanPin = pin.trim();
    if (!cleanName || !cleanPin) return;

    const response = await fetch("/api/participants/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName, pin: cleanPin }),
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error ?? "Nome ou PIN invalido.");
      return;
    }

    localStorage.setItem(participantStorageKey, JSON.stringify(data.participant));
    setParticipant(data.participant);
    setMessage(`Boa, ${data.participant.name}. Preencha tudo antes da abertura da Copa.`);
    await loadPublicData();
  }

  async function savePrediction(match: Match) {
    if (!participant) return;
    const draft = drafts[match.id];
    const homeScore = Number(draft?.home);
    const awayScore = Number(draft?.away);

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      setMessage("Informe placares validos, sem numeros negativos.");
      return;
    }

    setDrafts((current) => ({
      ...current,
      [match.id]: { home: String(homeScore), away: String(awayScore), saving: true },
    }));

    const response = await fetch("/api/predictions/group", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        match_id: match.id,
        home_score: homeScore,
        away_score: awayScore,
      }),
    });
    const payload = await response.json();

    setDrafts((current) => ({
      ...current,
      [match.id]: { home: String(homeScore), away: String(awayScore), saving: false },
    }));

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel salvar este palpite.");
      return;
    }

    setMessage("Palpite salvo.");
    await loadPublicData();
  }

  async function saveKnockoutStage(stage: KnockoutStage) {
    if (!participant) return;
    setSavingStage(stage);
    const response = await fetch("/api/predictions/knockout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        stage,
        team_names: knockoutDrafts[stage],
      }),
    });
    const payload = await response.json();
    setSavingStage(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel salvar o mata-mata.");
      return;
    }

    setMessage("Aposta do mata-mata salva.");
    await loadPublicData();
  }

  function toggleKnockoutTeam(stage: KnockoutStage, teamName: string) {
    const stageConfig = knockoutStages.find((item) => item.key === stage);
    if (!stageConfig) return;

    setKnockoutDrafts((current) => {
      const selected = current[stage] ?? [];
      const next = selected.includes(teamName)
        ? selected.filter((name) => name !== teamName)
        : selected.length < stageConfig.limit
          ? [...selected, teamName]
          : selected;
      return { ...current, [stage]: next };
    });
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-stone-950">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Copa do Mundo 2026
              </p>
              <h1 className="mt-2 text-3xl font-bold sm:text-5xl">Bolao da Copa</h1>
              <p className="mt-3 max-w-2xl text-base text-stone-600">
                Preencha placares da fase de grupos e selecoes do mata-mata antes da abertura.
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex h-11 items-center justify-center rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Admin
            </Link>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950">
            Prazo final das apostas: {lockDateLabel()}. {isLocked ? "Apostas encerradas." : "Apostas abertas."}
          </div>

          {!participant ? (
            <form onSubmit={handleJoin} className="grid max-w-2xl gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-[1fr_140px_auto]">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
                placeholder="Seu nome"
                maxLength={80}
              />
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
                placeholder="PIN"
                type="password"
                maxLength={20}
              />
              <button className="h-11 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800">
                Entrar
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
              <span className="rounded-md bg-emerald-100 px-3 py-2 font-semibold text-emerald-900">
                Jogando como {participant.name}
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem(participantStorageKey);
                  setParticipant(null);
                  setDrafts({});
                  setKnockoutDrafts(emptyKnockoutDraft);
                }}
                className="rounded-md border border-stone-300 px-3 py-2 font-medium"
              >
                Trocar nome
              </button>
            </div>
          )}

          {message ? <p className="text-sm font-medium text-stone-700">{message}</p> : null}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <section className="space-y-8">
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Fase de grupos</h2>
              <span className="text-sm text-stone-600">{groupStageMatches.length} partidas</span>
            </div>

            {loading ? <p>Carregando tabela...</p> : null}

            {Object.entries(groupedMatches).map(([group, groupMatches]) => (
              <div key={group} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-500">{group}</h3>
                <div className="grid gap-3">
                  {groupMatches.map((match) => {
                    const draft = drafts[match.id] ?? { home: "", away: "" };
                    const disabled = !participant || isLocked;
                    return (
                      <article key={match.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
                              <span>Jogo {match.match_number}</span>
                              <span>{matchDateLabel(match.kickoff_at)}</span>
                            </div>
                            <p className="mt-2 text-lg font-bold">
                              {match.home_team} <span className="text-stone-400">x</span> {match.away_team}
                            </p>
                            <p className="mt-1 text-sm text-stone-500">{match.stadium}</p>
                            {match.status === "finished" ? (
                              <p className="mt-2 text-sm font-semibold text-emerald-800">
                                Resultado: {match.home_score} x {match.away_score}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              aria-label={`Palpite ${match.home_team}`}
                              disabled={disabled}
                              value={draft.home}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [match.id]: { ...draft, home: event.target.value },
                                }))
                              }
                              className="h-11 w-14 rounded-md border border-stone-300 text-center text-sm font-bold outline-none ring-emerald-600 focus:ring-2 disabled:bg-stone-100"
                              inputMode="numeric"
                            />
                            <span className="font-bold text-stone-400">x</span>
                            <input
                              aria-label={`Palpite ${match.away_team}`}
                              disabled={disabled}
                              value={draft.away}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [match.id]: { ...draft, away: event.target.value },
                                }))
                              }
                              className="h-11 w-14 rounded-md border border-stone-300 text-center text-sm font-bold outline-none ring-emerald-600 focus:ring-2 disabled:bg-stone-100"
                              inputMode="numeric"
                            />
                            <button
                              disabled={disabled || draft.saving}
                              onClick={() => savePrediction(match)}
                              className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                            >
                              {draft.saving ? "Salvando" : "Salvar"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-bold">Mata-mata</h2>
              <p className="mt-1 text-sm text-stone-600">
                Escolha quais selecoes chegam em cada fase. Cada fase pode ser salva separadamente.
              </p>
            </div>

            <div className="grid gap-4">
              {knockoutStages.map((stage) => {
                const selected = knockoutDrafts[stage.key] ?? [];
                return (
                  <article key={stage.key} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">{stage.label}</h3>
                        <p className="text-sm text-stone-500">
                          {selected.length}/{stage.limit} selecoes · {stage.points} pontos por acerto
                        </p>
                      </div>
                      <button
                        disabled={!participant || isLocked || savingStage === stage.key}
                        onClick={() => saveKnockoutStage(stage.key)}
                        className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                      >
                        {savingStage === stage.key ? "Salvando" : "Salvar fase"}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {teams.map((team) => {
                        const checked = selected.includes(team.name);
                        const disabled =
                          !participant || isLocked || (!checked && selected.length >= stage.limit);
                        return (
                          <label
                            key={`${stage.key}-${team.name}`}
                            className="flex min-h-10 items-center gap-2 rounded-md border border-stone-200 px-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={checked}
                              onChange={() => toggleKnockoutTeam(stage.key, team.name)}
                              className="h-4 w-4 accent-emerald-700"
                            />
                            <span>{team.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>

        <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-xl font-bold">Ranking</h2>
          <div className="mt-4 space-y-3">
            {ranking.length === 0 ? (
              <p className="text-sm text-stone-500">O ranking aparece quando houver palpites e resultados.</p>
            ) : (
              ranking.map((row, index) => (
                <div key={row.participant_id} className="flex items-center justify-between border-b border-stone-100 pb-3 last:border-0">
                  <div>
                    <p className="font-semibold">
                      {index + 1}. {row.participant_name}
                    </p>
                    <p className="text-xs text-stone-500">
                      Grupos {row.group_points} · Mata-mata {row.knockout_points}
                    </p>
                  </div>
                  <span className="rounded-md bg-stone-950 px-2 py-1 text-sm font-bold text-white">
                    {row.total_points}
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
