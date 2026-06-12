import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getStageLimit, isKnockoutStage } from "@/lib/knockout";
import { getPredictionAccess } from "@/lib/prediction-access";

export async function POST(request: Request) {
  const body = await request.json();
  const participantId = String(body.participant_id ?? "");
  const stage = String(body.stage ?? "");
  const teams = Array.isArray(body.team_names)
    ? [...new Set(body.team_names.map((team: unknown) => String(team).trim()).filter(Boolean))]
    : [];

  if (!participantId || !isKnockoutStage(stage)) {
    return NextResponse.json({ error: "Participante e fase sao obrigatorios." }, { status: 400 });
  }

  const access = getPredictionAccess(participantId);
  if (!access.canSave) {
    return NextResponse.json({ error: "Apostas encerradas." }, { status: 403 });
  }

  const limit = getStageLimit(stage);
  if (teams.length > limit) {
    return NextResponse.json({ error: `Escolha no maximo ${limit} selecoes.` }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  if (teams.length > 0) {
    const { data: validTeams, error: teamError } = await supabase
      .from("teams")
      .select("name")
      .in("name", teams);

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 500 });
    }

    if ((validTeams ?? []).length !== teams.length) {
      return NextResponse.json({ error: "Lista de selecoes invalida." }, { status: 400 });
    }
  }

  if (access.isExceptionOpen) {
    const { data: existingPredictions, error: existingPredictionsError } = await supabase
      .from("knockout_predictions")
      .select("team_name")
      .eq("participant_id", participantId)
      .eq("stage", stage);

    if (existingPredictionsError) {
      return NextResponse.json({ error: existingPredictionsError.message }, { status: 500 });
    }

    const existingTeams = new Set((existingPredictions ?? []).map((prediction) => prediction.team_name));

    if (existingTeams.size >= limit) {
      return NextResponse.json({ error: "Esta fase ja foi preenchida." }, { status: 403 });
    }

    if (![...existingTeams].every((team) => teams.includes(team))) {
      return NextResponse.json({ error: "Selecoes ja preenchidas nao podem ser alteradas." }, { status: 403 });
    }
  }

  const { error: deleteError } = await supabase
    .from("knockout_predictions")
    .delete()
    .eq("participant_id", participantId)
    .eq("stage", stage);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (teams.length > 0) {
    const { error: insertError } = await supabase.from("knockout_predictions").insert(
      teams.map((team) => ({
        participant_id: participantId,
        stage,
        team_name: team,
      })),
    );

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
