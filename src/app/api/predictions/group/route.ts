import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getPredictionAccess } from "@/lib/prediction-access";

export async function POST(request: Request) {
  const body = await request.json();
  const participantId = String(body.participant_id ?? "");
  const matchId = String(body.match_id ?? "");
  const homeScore = Number(body.home_score);
  const awayScore = Number(body.away_score);

  if (!participantId || !matchId) {
    return NextResponse.json({ error: "Participante e jogo sao obrigatorios." }, { status: 400 });
  }

  const access = getPredictionAccess(participantId);
  if (!access.canSave) {
    return NextResponse.json({ error: "Apostas encerradas." }, { status: 403 });
  }

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    return NextResponse.json({ error: "Placar invalido." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, stage, kickoff_at, status")
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Jogo nao encontrado." }, { status: 404 });
  }

  if (match.stage !== "Fase de grupos") {
    return NextResponse.json({ error: "Palpite de placar so vale para fase de grupos." }, { status: 400 });
  }

  if (access.isExceptionOpen) {
    if (match.status === "finished" || new Date(match.kickoff_at).getTime() <= new Date(access.now).getTime()) {
      return NextResponse.json({ error: "Este jogo ja comecou e nao pode mais receber palpite." }, { status: 403 });
    }

    const { data: existingPrediction, error: existingPredictionError } = await supabase
      .from("predictions")
      .select("id")
      .eq("participant_id", participantId)
      .eq("match_id", matchId)
      .maybeSingle();

    if (existingPredictionError) {
      return NextResponse.json({ error: existingPredictionError.message }, { status: 500 });
    }

    if (existingPrediction) {
      return NextResponse.json({ error: "Este palpite ja foi preenchido e nao pode ser alterado." }, { status: 403 });
    }
  }

  const { error } = await supabase.from("predictions").upsert(
    {
      participant_id: participantId,
      match_id: matchId,
      home_score: homeScore,
      away_score: awayScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "participant_id,match_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
