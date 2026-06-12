import { NextResponse } from "next/server";
import { getPredictionAccess } from "@/lib/prediction-access";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const body = await request.json();
  const participantId = String(body.participant_id ?? "");
  const groupName = String(body.group_name ?? "").trim();
  const firstPlace = String(body.first_place ?? "").trim();
  const secondPlace = String(body.second_place ?? "").trim();

  if (!participantId || !groupName || !firstPlace || !secondPlace) {
    return NextResponse.json({ error: "Participante, grupo, 1º e 2º sao obrigatorios." }, { status: 400 });
  }

  const access = getPredictionAccess(participantId);
  if (!access.canSave) {
    return NextResponse.json({ error: "Apostas encerradas." }, { status: 403 });
  }

  if (firstPlace === secondPlace) {
    return NextResponse.json({ error: "1º e 2º colocados precisam ser selecoes diferentes." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("home_team, away_team")
    .eq("stage", "Fase de grupos")
    .eq("group_name", groupName);

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  const groupTeams = new Set((matches ?? []).flatMap((match) => [match.home_team, match.away_team]));
  if (!groupTeams.has(firstPlace) || !groupTeams.has(secondPlace)) {
    return NextResponse.json({ error: "Selecoes invalidas para este grupo." }, { status: 400 });
  }

  if (access.isExceptionOpen) {
    const { data: existingPredictions, error: existingPredictionsError } = await supabase
      .from("group_position_predictions")
      .select("position, team_name")
      .eq("participant_id", participantId)
      .eq("group_name", groupName);

    if (existingPredictionsError) {
      return NextResponse.json({ error: existingPredictionsError.message }, { status: 500 });
    }

    const existingByPosition = new Map(
      (existingPredictions ?? []).map((prediction) => [prediction.position, prediction.team_name]),
    );

    if (existingByPosition.has(1) && existingByPosition.has(2)) {
      return NextResponse.json({ error: "Classificacao deste grupo ja foi preenchida." }, { status: 403 });
    }

    if (
      (existingByPosition.has(1) && existingByPosition.get(1) !== firstPlace) ||
      (existingByPosition.has(2) && existingByPosition.get(2) !== secondPlace)
    ) {
      return NextResponse.json({ error: "Classificacao ja preenchida nao pode ser alterada." }, { status: 403 });
    }
  }

  const { error: deleteError } = await supabase
    .from("group_position_predictions")
    .delete()
    .eq("participant_id", participantId)
    .eq("group_name", groupName);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("group_position_predictions").insert([
    { participant_id: participantId, group_name: groupName, position: 1, team_name: firstPlace },
    { participant_id: participantId, group_name: groupName, position: 2, team_name: secondPlace },
  ]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
