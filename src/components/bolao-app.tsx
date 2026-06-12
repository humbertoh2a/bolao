"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { knockoutStages, predictionLockAt } from "@/lib/knockout";
import { supabase } from "@/lib/supabase-browser";
import { formatTeamName } from "@/lib/team-names";
import type {
  GroupPositionPrediction,
  KnockoutPrediction,
  KnockoutStage,
  Match,
  Prediction,
  RankingRow,
  Team,
} from "@/lib/types";

type PredictionDraft = Record<string, { home: string; away: string; saving?: boolean }>;
type KnockoutDraft = Record<KnockoutStage, string[]>;
type GroupPositionDraft = Record<string, { first: string; second: string; saving?: boolean }>;
type SaveStatus = "saved" | "dirty" | "saving" | "error";
type StatusMap = Record<string, SaveStatus>;
type PredictionAccess = {
  is_general_open: boolean;
  is_exception_open: boolean;
  exception_expires_at: string;
  now: string;
};

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

function groupTeams(matches: Match[]) {
  return matches.reduce<Record<string, string[]>>((acc, match) => {
    if (!match.group_name) return acc;
    acc[match.group_name] = Array.from(
      new Set([...(acc[match.group_name] ?? []), match.home_team, match.away_team]),
    ).sort();
    return acc;
  }, {});
}

function sameSelection(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

export function BolaoApp() {
  const [participant, setParticipant] = useState<{ id: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [drafts, setDrafts] = useState<PredictionDraft>({});
  const [groupPositionDrafts, setGroupPositionDrafts] = useState<GroupPositionDraft>({});
  const [knockoutDrafts, setKnockoutDrafts] = useState<KnockoutDraft>(emptyKnockoutDraft);
  const [savedDrafts, setSavedDrafts] = useState<PredictionDraft>({});
  const [savedGroupPositionDrafts, setSavedGroupPositionDrafts] = useState<GroupPositionDraft>({});
  const [savedKnockoutDrafts, setSavedKnockoutDrafts] = useState<KnockoutDraft>(emptyKnockoutDraft);
  const [groupMatchStatuses, setGroupMatchStatuses] = useState<StatusMap>({});
  const [groupPositionStatuses, setGroupPositionStatuses] = useState<StatusMap>({});
  const [knockoutStatuses, setKnockoutStatuses] = useState<Record<KnockoutStage, SaveStatus | undefined>>(
    {} as Record<KnockoutStage, SaveStatus | undefined>,
  );
  const [savingStage, setSavingStage] = useState<KnockoutStage | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [predictionAccess, setPredictionAccess] = useState<PredictionAccess | null>(null);

  const isGeneralOpen = predictionAccess?.is_general_open ?? Date.now() < new Date(predictionLockAt).getTime();
  const isExceptionOpen = predictionAccess?.is_exception_open ?? false;
  const isLocked = !isGeneralOpen && !isExceptionOpen;
  const accessNow = predictionAccess?.now ?? new Date().toISOString();
  const groupStageMatches = useMemo(
    () => matches.filter((match) => match.stage === "Fase de grupos"),
    [matches],
  );
  const groupedMatches = useMemo(() => groupMatches(groupStageMatches), [groupStageMatches]);
  const teamsByGroup = useMemo(() => groupTeams(groupStageMatches), [groupStageMatches]);
  const completion = useMemo(() => {
    const groupMatchesFilled = groupStageMatches.filter((match) => {
      const draft = drafts[match.id];
      return draft?.home !== "" && draft?.away !== "" && draft?.home !== undefined && draft?.away !== undefined;
    }).length;
    const groupNames = Object.keys(teamsByGroup);
    const groupPositionsFilled = groupNames.filter((groupName) => {
      const draft = groupPositionDrafts[groupName];
      return Boolean(draft?.first && draft?.second && draft.first !== draft.second);
    }).length;
    const knockoutStagesFilled = knockoutStages.filter((stage) => {
      return (knockoutDrafts[stage.key] ?? []).length === stage.limit;
    }).length;
    const total = groupStageMatches.length + groupNames.length + knockoutStages.length;
    const filled = groupMatchesFilled + groupPositionsFilled + knockoutStagesFilled;

    return { filled, total, missing: Math.max(total - filled, 0), isComplete: total > 0 && filled === total };
  }, [drafts, groupPositionDrafts, groupStageMatches, knockoutDrafts, teamsByGroup]);

  function statusLabel(status?: SaveStatus) {
    if (status === "saving") return "Salvando";
    if (status === "saved") return "Salvo";
    if (status === "dirty") return "Alterado";
    if (status === "error") return "Erro";
    return "";
  }

  function statusClassName(status?: SaveStatus) {
    if (status === "saving") return "text-amber-700";
    if (status === "saved") return "text-emerald-700";
    if (status === "dirty") return "text-stone-500";
    if (status === "error") return "text-red-700";
    return "text-stone-500";
  }

  function savedMatchExists(matchId: string) {
    const savedDraft = savedDrafts[matchId];
    return savedDraft?.home !== undefined && savedDraft?.away !== undefined;
  }

  function canEditMatch(match: Match) {
    if (!participant || !predictionAccess) return false;
    if (predictionAccess.is_general_open) return true;
    if (!predictionAccess.is_exception_open || savedMatchExists(match.id)) return false;
    return match.status !== "finished" && new Date(match.kickoff_at).getTime() > new Date(accessNow).getTime();
  }

  function canEditGroupPosition(groupName: string) {
    if (!participant || !predictionAccess) return false;
    if (predictionAccess.is_general_open) return true;
    if (!predictionAccess.is_exception_open) return false;
    const savedDraft = savedGroupPositionDrafts[groupName];
    return !(savedDraft?.first && savedDraft?.second);
  }

  function canEditKnockoutStage(stage: KnockoutStage) {
    if (!participant || !predictionAccess) return false;
    if (predictionAccess.is_general_open) return true;
    if (!predictionAccess.is_exception_open) return false;
    const stageConfig = knockoutStages.find((item) => item.key === stage);
    return (savedKnockoutDrafts[stage] ?? []).length < (stageConfig?.limit ?? 0);
  }

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

  const loadPredictionAccess = useCallback(async function loadPredictionAccess(participantId: string) {
    const response = await fetch(`/api/predictions/access?participant_id=${encodeURIComponent(participantId)}`);
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel carregar permissoes de aposta.");
      return;
    }

    setPredictionAccess(payload as PredictionAccess);
  }, []);

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

  const loadParticipantPredictions = useCallback(async function loadParticipantPredictions(participantId: string) {
    const [
      accessResult,
      { data: groupData, error: groupError },
      { data: positionData, error: positionError },
      { data: knockoutData, error: knockoutError },
    ] =
      await Promise.all([
        loadPredictionAccess(participantId),
        supabase.from("predictions").select("*").eq("participant_id", participantId),
        supabase.from("group_position_predictions").select("*").eq("participant_id", participantId),
        supabase.from("knockout_predictions").select("*").eq("participant_id", participantId),
      ]);
    void accessResult;

    if (groupError || positionError || knockoutError) {
      setMessage("Nao foi possivel carregar seus palpites.");
      return;
    }

    const nextDrafts: PredictionDraft = {};
    const nextGroupMatchStatuses: StatusMap = {};
    ((groupData ?? []) as Prediction[]).forEach((prediction) => {
      nextDrafts[prediction.match_id] = {
        home: String(prediction.home_score),
        away: String(prediction.away_score),
      };
      nextGroupMatchStatuses[prediction.match_id] = "saved";
    });
    setDrafts(nextDrafts);
    setSavedDrafts(nextDrafts);
    setGroupMatchStatuses(nextGroupMatchStatuses);

    const nextGroupPositionDrafts: GroupPositionDraft = {};
    const nextGroupPositionStatuses: StatusMap = {};
    ((positionData ?? []) as GroupPositionPrediction[]).forEach((prediction) => {
      const current = nextGroupPositionDrafts[prediction.group_name] ?? { first: "", second: "" };
      nextGroupPositionDrafts[prediction.group_name] = {
        ...current,
        [prediction.position === 1 ? "first" : "second"]: prediction.team_name,
      };
      nextGroupPositionStatuses[prediction.group_name] = "saved";
    });
    setGroupPositionDrafts(nextGroupPositionDrafts);
    setSavedGroupPositionDrafts(nextGroupPositionDrafts);
    setGroupPositionStatuses(nextGroupPositionStatuses);

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
    setSavedKnockoutDrafts(nextKnockoutDrafts);
    setKnockoutStatuses(
      knockoutStages.reduce<Record<KnockoutStage, SaveStatus | undefined>>((acc, stage) => {
        acc[stage.key] = nextKnockoutDrafts[stage.key].length > 0 ? "saved" : undefined;
        return acc;
      }, {} as Record<KnockoutStage, SaveStatus | undefined>),
    );
  }, [loadPredictionAccess]);

  useEffect(() => {
    if (participant) {
      queueMicrotask(() => {
        loadParticipantPredictions(participant.id);
      });
    }
  }, [loadParticipantPredictions, participant]);

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

  async function savePrediction(match: Match, options?: { silent?: boolean }) {
    if (!participant) return false;
    const draft = drafts[match.id];
    const homeScore = Number(draft?.home);
    const awayScore = Number(draft?.away);

    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      if (!options?.silent) setMessage("Informe placares validos, sem numeros negativos.");
      setGroupMatchStatuses((current) => ({ ...current, [match.id]: "error" }));
      return false;
    }

    setGroupMatchStatuses((current) => ({ ...current, [match.id]: "saving" }));
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
      if (!options?.silent) setMessage(payload.error ?? "Nao foi possivel salvar este palpite.");
      setGroupMatchStatuses((current) => ({ ...current, [match.id]: "error" }));
      return false;
    }

    setGroupMatchStatuses((current) => ({ ...current, [match.id]: "saved" }));
    setSavedDrafts((current) => ({
      ...current,
      [match.id]: { home: String(homeScore), away: String(awayScore) },
    }));
    if (!options?.silent) {
      setMessage("Palpite salvo.");
      await loadPublicData();
    }
    return true;
  }

  async function saveKnockoutStage(stage: KnockoutStage, options?: { silent?: boolean }) {
    if (!participant) return false;
    setSavingStage(stage);
    setKnockoutStatuses((current) => ({ ...current, [stage]: "saving" }));
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
      if (!options?.silent) setMessage(payload.error ?? "Nao foi possivel salvar o mata-mata.");
      setKnockoutStatuses((current) => ({ ...current, [stage]: "error" }));
      return false;
    }

    setKnockoutStatuses((current) => ({ ...current, [stage]: "saved" }));
    setSavedKnockoutDrafts((current) => ({ ...current, [stage]: [...(knockoutDrafts[stage] ?? [])] }));
    if (!options?.silent) {
      setMessage("Aposta do mata-mata salva.");
      await loadPublicData();
    }
    return true;
  }

  async function saveGroupPosition(groupName: string, options?: { silent?: boolean }) {
    if (!participant) return false;
    const draft = groupPositionDrafts[groupName] ?? { first: "", second: "" };

    if (!draft.first || !draft.second) {
      if (!options?.silent) setMessage("Escolha 1º e 2º colocado do grupo.");
      setGroupPositionStatuses((current) => ({ ...current, [groupName]: "error" }));
      return false;
    }

    if (draft.first === draft.second) {
      if (!options?.silent) setMessage("1º e 2º colocados precisam ser selecoes diferentes.");
      setGroupPositionStatuses((current) => ({ ...current, [groupName]: "error" }));
      return false;
    }

    setGroupPositionStatuses((current) => ({ ...current, [groupName]: "saving" }));
    setGroupPositionDrafts((current) => ({
      ...current,
      [groupName]: { ...draft, saving: true },
    }));

    const response = await fetch("/api/predictions/group-positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        participant_id: participant.id,
        group_name: groupName,
        first_place: draft.first,
        second_place: draft.second,
      }),
    });
    const payload = await response.json();

    setGroupPositionDrafts((current) => ({
      ...current,
      [groupName]: { ...draft, saving: false },
    }));

    if (!response.ok) {
      if (!options?.silent) setMessage(payload.error ?? "Nao foi possivel salvar classificados do grupo.");
      setGroupPositionStatuses((current) => ({ ...current, [groupName]: "error" }));
      return false;
    }

    setGroupPositionStatuses((current) => ({ ...current, [groupName]: "saved" }));
    setSavedGroupPositionDrafts((current) => ({ ...current, [groupName]: { first: draft.first, second: draft.second } }));
    if (!options?.silent) {
      setMessage("Classificacao do grupo salva.");
      await loadPublicData();
    }
    return true;
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
    setKnockoutStatuses((current) => ({ ...current, [stage]: "dirty" }));
  }

  async function saveAllPredictions() {
    if (!participant || isLocked || savingAll) return;

    setSavingAll(true);
    let saved = 0;
    let failed = 0;

    for (const match of groupStageMatches) {
      const draft = drafts[match.id];
      const savedDraft = savedDrafts[match.id];
      const currentHome = draft?.home === undefined || draft.home === "" ? "" : String(Number(draft.home));
      const currentAway = draft?.away === undefined || draft.away === "" ? "" : String(Number(draft.away));
      const savedHome = savedDraft?.home === undefined || savedDraft.home === "" ? "" : String(Number(savedDraft.home));
      const savedAway = savedDraft?.away === undefined || savedDraft.away === "" ? "" : String(Number(savedDraft.away));
      if (
        canEditMatch(match) &&
        draft?.home !== "" &&
        draft?.away !== "" &&
        draft?.home !== undefined &&
        draft?.away !== undefined &&
        (currentHome !== savedHome || currentAway !== savedAway)
      ) {
        const ok = await savePrediction(match, { silent: true });
        if (ok) saved += 1;
        else failed += 1;
      }
    }

    for (const groupName of Object.keys(teamsByGroup)) {
      const draft = groupPositionDrafts[groupName];
      const savedDraft = savedGroupPositionDrafts[groupName];
      if (
        canEditGroupPosition(groupName) &&
        draft?.first &&
        draft?.second &&
        (draft.first !== savedDraft?.first || draft.second !== savedDraft?.second)
      ) {
        const ok = await saveGroupPosition(groupName, { silent: true });
        if (ok) saved += 1;
        else failed += 1;
      }
    }

    for (const stage of knockoutStages) {
      const selected = knockoutDrafts[stage.key] ?? [];
      const savedSelected = savedKnockoutDrafts[stage.key] ?? [];
      if (canEditKnockoutStage(stage.key) && selected.length > 0 && !sameSelection(selected, savedSelected)) {
        const ok = await saveKnockoutStage(stage.key, { silent: true });
        if (ok) saved += 1;
        else failed += 1;
      }
    }

    setSavingAll(false);
    await loadPublicData();

    if (failed > 0) {
      setMessage(`${saved} itens salvos. ${failed} itens com erro.`);
    } else if (saved > 0) {
      setMessage(`${saved} itens salvos.`);
    } else {
      setMessage("Nenhuma alteracao nova para salvar.");
    }
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

          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-950 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid min-w-0 gap-2">
              <span>
                Prazo final das apostas: {lockDateLabel()}.{" "}
                {isGeneralOpen
                  ? "Apostas abertas."
                  : isExceptionOpen
                    ? "Excecao temporaria ativa para completar pendencias."
                    : "Apostas encerradas."}
              </span>
              {participant ? (
                <span
                  className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${
                    completion.isComplete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {completion.isComplete
                    ? "Todas as apostas estao preenchidas"
                    : `Faltam ${completion.missing} itens para preencher tudo`}
                </span>
              ) : null}
            </div>
            <button
              onClick={saveAllPredictions}
              disabled={!participant || isLocked || savingAll}
              className="h-10 w-full shrink-0 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
            >
              {savingAll ? "Salvando tudo" : "Salvar tudo"}
            </button>
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
              <Link href="/minhas-apostas" className="rounded-md border border-emerald-700 px-3 py-2 font-semibold text-emerald-800">
                Ver resumo / PDF
              </Link>
              <button
                onClick={() => {
                  localStorage.removeItem(participantStorageKey);
                  setParticipant(null);
                  setDrafts({});
                  setGroupPositionDrafts({});
                  setKnockoutDrafts(emptyKnockoutDraft);
                  setSavedDrafts({});
                  setSavedGroupPositionDrafts({});
                  setSavedKnockoutDrafts(emptyKnockoutDraft);
                  setGroupMatchStatuses({});
                  setGroupPositionStatuses({});
                  setKnockoutStatuses({} as Record<KnockoutStage, SaveStatus | undefined>);
                  setPredictionAccess(null);
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
                    const disabled = !canEditMatch(match);
                    return (
                      <article key={match.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500">
                              <span>Jogo {match.match_number}</span>
                              <span>{matchDateLabel(match.kickoff_at)}</span>
                            </div>
                            <p className="mt-2 text-lg font-bold">
                              {formatTeamName(match.home_team)} <span className="text-stone-400">x</span>{" "}
                              {formatTeamName(match.away_team)}
                            </p>
                            <p className="mt-1 text-sm text-stone-500">{match.stadium}</p>
                            {match.status === "finished" ? (
                              <p className="mt-2 text-sm font-semibold text-emerald-800">
                                Resultado: {match.home_score} x {match.away_score}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-start gap-2">
                            <input
                              aria-label={`Palpite ${formatTeamName(match.home_team)}`}
                              disabled={disabled}
                              value={draft.home}
                              onChange={(event) =>
                                {
                                  setDrafts((current) => ({
                                    ...current,
                                    [match.id]: { ...draft, home: event.target.value },
                                  }));
                                  setGroupMatchStatuses((current) => ({ ...current, [match.id]: "dirty" }));
                                }
                              }
                              className="h-11 w-14 rounded-md border border-stone-300 text-center text-sm font-bold outline-none ring-emerald-600 focus:ring-2 disabled:bg-stone-100"
                              inputMode="numeric"
                            />
                            <span className="font-bold text-stone-400">x</span>
                            <input
                              aria-label={`Palpite ${formatTeamName(match.away_team)}`}
                              disabled={disabled}
                              value={draft.away}
                              onChange={(event) =>
                                {
                                  setDrafts((current) => ({
                                    ...current,
                                    [match.id]: { ...draft, away: event.target.value },
                                  }));
                                  setGroupMatchStatuses((current) => ({ ...current, [match.id]: "dirty" }));
                                }
                              }
                              className="h-11 w-14 rounded-md border border-stone-300 text-center text-sm font-bold outline-none ring-emerald-600 focus:ring-2 disabled:bg-stone-100"
                              inputMode="numeric"
                            />
                            <div className="flex flex-col items-end gap-1">
                              <button
                                disabled={disabled || draft.saving}
                                onClick={() => savePrediction(match)}
                                className="h-11 w-24 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                              >
                                {draft.saving ? "Salvando" : "Salvar"}
                              </button>
                              <span className={`h-4 whitespace-nowrap text-right text-xs font-semibold leading-4 ${statusClassName(groupMatchStatuses[match.id])}`}>
                                {statusLabel(groupMatchStatuses[match.id])}
                              </span>
                            </div>
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
              <h2 className="text-xl font-bold">Classificacao dos grupos</h2>
              <p className="mt-1 text-sm text-stone-600">
                Acerte o 1º e 2º colocado de cada grupo. Posicao exata vale 5 pontos; invertido vale 2.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(teamsByGroup).map(([groupName, groupTeams]) => {
                const draft = groupPositionDrafts[groupName] ?? { first: "", second: "" };
                const disabled = !canEditGroupPosition(groupName);
                const savedDraft = savedGroupPositionDrafts[groupName];
                return (
                  <article key={groupName} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">Grupo {groupName}</h3>
                        <p className="text-sm text-stone-500">Escolha 1º e 2º</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          disabled={disabled || draft.saving}
                          onClick={() => saveGroupPosition(groupName)}
                          className="h-10 w-24 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                        >
                          {draft.saving ? "Salvando" : "Salvar"}
                        </button>
                        <span className={`h-4 whitespace-nowrap text-right text-xs font-semibold leading-4 ${statusClassName(groupPositionStatuses[groupName])}`}>
                          {statusLabel(groupPositionStatuses[groupName])}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        1º colocado
                        <select
                          disabled={disabled || (isExceptionOpen && Boolean(savedDraft?.first))}
                          value={draft.first}
                          onChange={(event) =>
                            {
                              setGroupPositionDrafts((current) => ({
                                ...current,
                                [groupName]: { ...draft, first: event.target.value },
                              }));
                              setGroupPositionStatuses((current) => ({ ...current, [groupName]: "dirty" }));
                            }
                          }
                          className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm font-normal outline-none ring-emerald-600 focus:ring-2 disabled:bg-stone-100"
                        >
                          <option value="">Selecao</option>
                          {groupTeams.map((team) => (
                            <option key={`first-${groupName}-${team}`} value={team} disabled={team === draft.second}>
                              {formatTeamName(team)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        2º colocado
                        <select
                          disabled={disabled || (isExceptionOpen && Boolean(savedDraft?.second))}
                          value={draft.second}
                          onChange={(event) =>
                            {
                              setGroupPositionDrafts((current) => ({
                                ...current,
                                [groupName]: { ...draft, second: event.target.value },
                              }));
                              setGroupPositionStatuses((current) => ({ ...current, [groupName]: "dirty" }));
                            }
                          }
                          className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm font-normal outline-none ring-emerald-600 focus:ring-2 disabled:bg-stone-100"
                        >
                          <option value="">Selecao</option>
                          {groupTeams.map((team) => (
                            <option key={`second-${groupName}-${team}`} value={team} disabled={team === draft.first}>
                              {formatTeamName(team)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
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
                const savedSelected = savedKnockoutDrafts[stage.key] ?? [];
                const stageCanEdit = canEditKnockoutStage(stage.key);
                return (
                  <article key={stage.key} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">{stage.label}</h3>
                        <p className="text-sm text-stone-500">
                          {selected.length}/{stage.limit} selecoes · {stage.points} pontos por acerto
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <button
                          disabled={!stageCanEdit || savingStage === stage.key}
                          onClick={() => saveKnockoutStage(stage.key)}
                          className="h-10 w-28 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                        >
                          {savingStage === stage.key ? "Salvando" : "Salvar fase"}
                        </button>
                        <span className={`h-4 whitespace-nowrap text-right text-xs font-semibold leading-4 ${statusClassName(knockoutStatuses[stage.key])}`}>
                          {statusLabel(knockoutStatuses[stage.key])}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {teams.map((team) => {
                        const checked = selected.includes(team.name);
                        const isSavedSelection = savedSelected.includes(team.name);
                        const disabled =
                          !stageCanEdit ||
                          (isExceptionOpen && isSavedSelection) ||
                          (!checked && selected.length >= stage.limit);
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
                            <span>{formatTeamName(team.name)}</span>
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
          <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1 lg:max-h-[calc(100vh-160px)]">
            {ranking.length === 0 ? (
              <p className="text-sm text-stone-500">O ranking aparece quando houver palpites e resultados.</p>
            ) : (
              ranking.map((row, index) => (
                <div
                  key={row.participant_id}
                  className="flex items-center justify-between gap-3 border-b border-stone-100 pb-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">
                      {index + 1}. {row.participant_name}
                    </p>
                    <p className="break-words text-xs text-stone-500">
                      Grupos {row.group_points} · Classificacao {row.group_position_points} · Mata-mata {row.knockout_points}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-stone-950 px-2 py-1 text-sm font-bold text-white">
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
