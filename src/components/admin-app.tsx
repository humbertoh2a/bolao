"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { knockoutStages } from "@/lib/knockout";
import { supabase } from "@/lib/supabase-browser";
import { formatTeamName } from "@/lib/team-names";
import type { GroupPositionActual, KnockoutActual, KnockoutStage, Match, Team } from "@/lib/types";

type ResultDraft = Record<string, { home: string; away: string; status: string; saving?: boolean }>;
type Participant = {
  id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
  completion_filled: number;
  completion_total: number;
  completion_missing: number;
  completion_complete: boolean;
};
type ActualDraft = Record<KnockoutStage, string[]>;
type GroupActualDraft = Record<string, { first: string; second: string; saving?: boolean }>;

const emptyActualDraft = knockoutStages.reduce<ActualDraft>((acc, stage) => {
  acc[stage.key] = [];
  return acc;
}, {} as ActualDraft);

const adminStorageKey = "bolao:admin-password";

export function AdminApp() {
  const [password, setPassword] = useState("");
  const [isLogged, setIsLogged] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [drafts, setDrafts] = useState<ResultDraft>({});
  const [groupActualDrafts, setGroupActualDrafts] = useState<GroupActualDraft>({});
  const [actualDrafts, setActualDrafts] = useState<ActualDraft>(emptyActualDraft);
  const [savingActualStage, setSavingActualStage] = useState<KnockoutStage | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [participantPin, setParticipantPin] = useState("");
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const stats = useMemo(() => {
    const finished = matches.filter((match) => match.status === "finished").length;
    return { finished, scheduled: matches.length - finished };
  }, [matches]);

  const teamsByGroup = useMemo(() => {
    return matches
      .filter((match) => match.stage === "Fase de grupos" && match.group_name)
      .reduce<Record<string, string[]>>((acc, match) => {
        const groupName = match.group_name as string;
        acc[groupName] = Array.from(new Set([...(acc[groupName] ?? []), match.home_team, match.away_team])).sort();
        return acc;
      }, {});
  }, [matches]);

  const loadMatches = useCallback(async function loadMatches() {
    setLoading(true);
    const [
      { data, error },
      { data: teamData },
      { data: groupActualData, error: groupActualError },
      { data: actualData, error: actualError },
    ] = await Promise.all([
      supabase.from("matches").select("*").order("match_number"),
      supabase.from("teams").select("*").order("name"),
      supabase.from("group_position_actuals").select("*"),
      supabase.from("knockout_actuals").select("*"),
    ]);
    setLoading(false);

    if (error || groupActualError || actualError) {
      setMessage("Nao foi possivel carregar os jogos.");
      return;
    }

    const loadedMatches = (data ?? []) as Match[];
    setMatches(loadedMatches);
    setTeams((teamData ?? []) as Team[]);
    setDrafts(
      loadedMatches.reduce<ResultDraft>((acc, match) => {
        acc[match.id] = {
          home: match.home_score === null ? "" : String(match.home_score),
          away: match.away_score === null ? "" : String(match.away_score),
          status: match.status,
        };
        return acc;
      }, {}),
    );

    const nextActuals = knockoutStages.reduce<ActualDraft>((acc, stage) => {
      acc[stage.key] = [];
      return acc;
    }, {} as ActualDraft);
    ((actualData ?? []) as KnockoutActual[]).forEach((actual) => {
      nextActuals[actual.stage] = [...(nextActuals[actual.stage] ?? []), actual.team_name];
    });
    setActualDrafts(nextActuals);

    const nextGroupActuals: GroupActualDraft = {};
    ((groupActualData ?? []) as GroupPositionActual[]).forEach((actual) => {
      const current = nextGroupActuals[actual.group_name] ?? { first: "", second: "" };
      nextGroupActuals[actual.group_name] = {
        ...current,
        [actual.position === 1 ? "first" : "second"]: actual.team_name,
      };
    });
    setGroupActualDrafts(nextGroupActuals);
  }, []);

  const loadParticipants = useCallback(async function loadParticipants() {
    const response = await fetch("/api/admin/participants", {
      headers: { "x-admin-password": password },
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel carregar participantes.");
      return;
    }

    setParticipants(payload.participants);
  }, [password]);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = sessionStorage.getItem(adminStorageKey);
      if (stored) {
        setPassword(stored);
        setIsLogged(true);
      }
    });
  }, []);

  useEffect(() => {
    if (isLogged) {
      queueMicrotask(() => {
        loadMatches();
        loadParticipants();
      });
    }
  }, [isLogged, loadMatches, loadParticipants]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setMessage("Senha invalida ou ADMIN_PASSWORD ausente.");
      return;
    }

    sessionStorage.setItem(adminStorageKey, password);
    setIsLogged(true);
    setMessage("Acesso liberado.");
  }

  async function saveParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = editingParticipantId ? "PATCH" : "POST";
    const response = await fetch("/api/admin/participants", {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({
        id: editingParticipantId,
        name: participantName,
        pin: participantPin,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel salvar participante.");
      return;
    }

    setParticipantName("");
    setParticipantPin("");
    setEditingParticipantId(null);
    setMessage(editingParticipantId ? "Participante atualizado." : "Participante criado.");
    await loadParticipants();
  }

  async function deleteParticipant(participant: Participant) {
    if (!window.confirm(`Excluir ${participant.name} da lista ativa? As apostas serao preservadas.`)) {
      return;
    }

    const response = await fetch("/api/admin/participants", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ id: participant.id }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel excluir participante.");
      return;
    }

    setMessage("Participante removido da lista ativa. Apostas preservadas.");
    await loadParticipants();
  }

  async function restoreParticipant(participant: Participant) {
    const response = await fetch("/api/admin/participants", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ id: participant.id, restore: true }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel reativar participante.");
      return;
    }

    setMessage("Participante reativado.");
    await loadParticipants();
  }

  async function saveResult(match: Match) {
    const draft = drafts[match.id];
    setDrafts((current) => ({
      ...current,
      [match.id]: { ...draft, saving: true },
    }));

    const response = await fetch("/api/admin/matches", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({
        id: match.id,
        home_score: draft.home,
        away_score: draft.away,
        status: draft.status,
      }),
    });

    const payload = await response.json();
    setDrafts((current) => ({
      ...current,
      [match.id]: { ...draft, saving: false },
    }));

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel salvar o resultado.");
      return;
    }

    setMessage("Resultado atualizado.");
    setMatches((current) => current.map((item) => (item.id === match.id ? payload.match : item)));
  }

  async function saveActualStage(stage: KnockoutStage) {
    setSavingActualStage(stage);
    const response = await fetch("/api/admin/knockout-actuals", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({
        stage,
        team_names: actualDrafts[stage],
      }),
    });
    const payload = await response.json();
    setSavingActualStage(null);

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel salvar classificados.");
      return;
    }

    setMessage("Classificados atualizados.");
  }

  async function saveGroupActual(groupName: string) {
    const draft = groupActualDrafts[groupName] ?? { first: "", second: "" };

    if (!draft.first || !draft.second) {
      setMessage("Escolha 1º e 2º colocado do grupo.");
      return;
    }

    if (draft.first === draft.second) {
      setMessage("1º e 2º colocados precisam ser selecoes diferentes.");
      return;
    }

    setGroupActualDrafts((current) => ({
      ...current,
      [groupName]: { ...draft, saving: true },
    }));

    const response = await fetch("/api/admin/group-actuals", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({
        group_name: groupName,
        first_place: draft.first,
        second_place: draft.second,
      }),
    });
    const payload = await response.json();

    setGroupActualDrafts((current) => ({
      ...current,
      [groupName]: { ...draft, saving: false },
    }));

    if (!response.ok) {
      setMessage(payload.error ?? "Nao foi possivel salvar classificacao do grupo.");
      return;
    }

    setMessage("Classificacao do grupo atualizada.");
  }

  function toggleActualTeam(stage: KnockoutStage, teamName: string) {
    const stageConfig = knockoutStages.find((item) => item.key === stage);
    if (!stageConfig) return;

    setActualDrafts((current) => {
      const selected = current[stage] ?? [];
      const next = selected.includes(teamName)
        ? selected.filter((name) => name !== teamName)
        : selected.length < stageConfig.limit
          ? [...selected, teamName]
          : selected;
      return { ...current, [stage]: next };
    });
  }

  if (!isLogged) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f3ea] px-4 text-stone-950">
        <form onSubmit={handleLogin} className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Resultados</h1>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="mt-6 h-11 w-full rounded-md border border-stone-300 px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
            placeholder="Senha do admin"
          />
          <button className="mt-3 h-11 w-full rounded-md bg-stone-950 text-sm font-semibold text-white transition hover:bg-stone-800">
            Entrar
          </button>
          {message ? <p className="mt-3 text-sm text-stone-600">{message}</p> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ea] text-stone-950">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Admin</p>
              <h1 className="mt-2 text-3xl font-bold">Admin do bolao</h1>
              <p className="mt-2 text-sm text-stone-600">
                {participants.length} participantes · {stats.finished} finalizados · {stats.scheduled} agendados
              </p>
            </div>
            <Link className="inline-flex h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold" href="/">
              Voltar ao bolao
            </Link>
          </div>
          {message ? <p className="text-sm font-medium text-stone-700">{message}</p> : null}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="h-fit rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-xl font-bold">Participantes</h2>
          <form onSubmit={saveParticipant} className="mt-4 grid gap-3">
            <input
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              className="h-11 rounded-md border border-stone-300 px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
              placeholder="Nome"
              maxLength={80}
            />
            <input
              value={participantPin}
              onChange={(event) => setParticipantPin(event.target.value)}
              className="h-11 rounded-md border border-stone-300 px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
              placeholder="PIN individual"
              maxLength={20}
            />
            <div className="flex gap-2">
              <button className="h-11 flex-1 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
                {editingParticipantId ? "Atualizar" : "Adicionar"}
              </button>
              {editingParticipantId ? (
                <button
                  type="button"
                  onClick={() => {
                    setParticipantName("");
                    setParticipantPin("");
                    setEditingParticipantId(null);
                  }}
                  className="h-11 rounded-md border border-stone-300 px-4 text-sm font-semibold"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
          <div className="mt-5 grid max-h-[420px] gap-2 overflow-y-auto pr-1">
            {participants.length === 0 ? (
              <p className="text-sm text-stone-500">Cadastre participantes e entregue o PIN para cada pessoa.</p>
            ) : (
              participants.map((participant) => (
                <div
                  key={participant.id}
                  className={`rounded-md border p-3 ${
                    participant.deleted_at ? "border-stone-200 bg-stone-50 text-stone-500" : "border-stone-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold">{participant.name}</span>
                      {participant.deleted_at ? (
                        <p className="text-xs text-stone-500">Excluido logicamente</p>
                      ) : null}
                      <p
                        className={`mt-1 w-fit rounded-md px-2 py-1 text-xs font-bold ${
                          participant.completion_complete
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {participant.completion_complete
                          ? "Apostas completas"
                          : `Faltam ${participant.completion_missing} itens`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {participant.deleted_at ? (
                      <button
                        onClick={() => restoreParticipant(participant)}
                        className="rounded-md border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800"
                      >
                        Reativar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingParticipantId(participant.id);
                            setParticipantName(participant.name);
                            setParticipantPin("");
                          }}
                          className="rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold"
                        >
                          Novo PIN
                        </button>
                        <button
                          onClick={() => deleteParticipant(participant)}
                          className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-xl font-bold">Classificacao real dos grupos</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {Object.entries(teamsByGroup).map(([groupName, groupTeams]) => {
                const draft = groupActualDrafts[groupName] ?? { first: "", second: "" };
                return (
                  <article key={groupName} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">Grupo {groupName}</h3>
                        <p className="text-sm text-stone-500">Resultado real do top 2</p>
                      </div>
                      <button
                        onClick={() => saveGroupActual(groupName)}
                        disabled={draft.saving}
                        className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-stone-300"
                      >
                        {draft.saving ? "Salvando" : "Salvar"}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        1º colocado
                        <select
                          value={draft.first}
                          onChange={(event) =>
                            setGroupActualDrafts((current) => ({
                              ...current,
                              [groupName]: { ...draft, first: event.target.value },
                            }))
                          }
                          className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm font-normal outline-none ring-emerald-600 focus:ring-2"
                        >
                          <option value="">Selecao</option>
                          {groupTeams.map((team) => (
                            <option key={`actual-first-${groupName}-${team}`} value={team} disabled={team === draft.second}>
                              {formatTeamName(team)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm font-semibold text-stone-700">
                        2º colocado
                        <select
                          value={draft.second}
                          onChange={(event) =>
                            setGroupActualDrafts((current) => ({
                              ...current,
                              [groupName]: { ...draft, second: event.target.value },
                            }))
                          }
                          className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm font-normal outline-none ring-emerald-600 focus:ring-2"
                        >
                          <option value="">Selecao</option>
                          {groupTeams.map((team) => (
                            <option key={`actual-second-${groupName}-${team}`} value={team} disabled={team === draft.first}>
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

          <section>
            <h2 className="mb-4 text-xl font-bold">Classificados do mata-mata</h2>
            <div className="grid gap-4">
              {knockoutStages.map((stage) => {
                const selected = actualDrafts[stage.key] ?? [];
                return (
                  <article key={stage.key} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">{stage.label}</h3>
                        <p className="text-sm text-stone-500">
                          {selected.length}/{stage.limit} selecoes reais · {stage.points} pontos por acerto
                        </p>
                      </div>
                      <button
                        onClick={() => saveActualStage(stage.key)}
                        disabled={savingActualStage === stage.key}
                        className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-stone-300"
                      >
                        {savingActualStage === stage.key ? "Salvando" : "Salvar fase"}
                      </button>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {teams.map((team) => {
                        const checked = selected.includes(team.name);
                        const disabled = !checked && selected.length >= stage.limit;
                        return (
                          <label
                            key={`${stage.key}-${team.name}`}
                            className="flex min-h-10 items-center gap-2 rounded-md border border-stone-200 px-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleActualTeam(stage.key, team.name)}
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

          <section>
            <h2 className="mb-4 text-xl font-bold">Resultados dos jogos</h2>
        {loading ? <p>Carregando jogos...</p> : null}
        <div className="grid gap-3">
          {matches.map((match) => {
            const draft = drafts[match.id] ?? { home: "", away: "", status: "scheduled" };
            return (
              <article key={match.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Jogo {match.match_number} · {match.stage} {match.group_name ? `· Grupo ${match.group_name}` : ""}
                    </p>
                    <h2 className="mt-2 text-lg font-bold">
                      {formatTeamName(match.home_team)} x {formatTeamName(match.away_team)}
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">{match.stadium}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={draft.home}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, home: event.target.value },
                        }))
                      }
                      className="h-11 w-14 rounded-md border border-stone-300 text-center text-sm font-bold outline-none ring-emerald-600 focus:ring-2"
                      inputMode="numeric"
                    />
                    <span className="font-bold text-stone-400">x</span>
                    <input
                      value={draft.away}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, away: event.target.value },
                        }))
                      }
                      className="h-11 w-14 rounded-md border border-stone-300 text-center text-sm font-bold outline-none ring-emerald-600 focus:ring-2"
                      inputMode="numeric"
                    />
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [match.id]: { ...draft, status: event.target.value },
                        }))
                      }
                      className="h-11 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
                    >
                      <option value="scheduled">Agendado</option>
                      <option value="finished">Finalizado</option>
                    </select>
                    <button
                      onClick={() => saveResult(match)}
                      disabled={draft.saving}
                      className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:bg-stone-300"
                    >
                      {draft.saving ? "Salvando" : "Salvar"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
          </section>
        </div>
      </section>
    </main>
  );
}
