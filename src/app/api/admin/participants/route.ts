import { NextResponse } from "next/server";
import { knockoutStages } from "@/lib/knockout";
import { hashPin } from "@/lib/pin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

function isAuthorized(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && request.headers.get("x-admin-password") === adminPassword);
}

function validateParticipantInput(name: unknown, pin: unknown) {
  const cleanName = String(name ?? "").trim();
  const cleanPin = String(pin ?? "").trim();

  if (cleanName.length < 1 || cleanName.length > 80) {
    return { error: "Nome deve ter entre 1 e 80 caracteres." };
  }

  if (cleanPin.length < 4 || cleanPin.length > 20) {
    return { error: "PIN deve ter entre 4 e 20 caracteres." };
  }

  return { cleanName, cleanPin };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const [
    { data, error },
    { data: groupMatches, error: groupMatchesError },
    { data: groupPositions, error: groupPositionsError },
    { data: knockoutPredictions, error: knockoutPredictionsError },
  ] = await Promise.all([
    supabase
      .from("participants")
      .select("id, name, created_at, deleted_at")
      .order("deleted_at", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true }),
    supabase.from("matches").select("id, group_name").eq("stage", "Fase de grupos"),
    supabase.from("group_position_predictions").select("participant_id, group_name, position"),
    supabase.from("knockout_predictions").select("participant_id, stage, team_name"),
  ]);

  if (error || groupMatchesError || groupPositionsError || knockoutPredictionsError) {
    return NextResponse.json(
      { error: error?.message ?? groupMatchesError?.message ?? groupPositionsError?.message ?? knockoutPredictionsError?.message },
      { status: 500 },
    );
  }

  const groupMatchIds = new Set((groupMatches ?? []).map((match) => match.id));
  const groupNames = new Set((groupMatches ?? []).map((match) => match.group_name).filter(Boolean));
  const knockoutLimits = new Map(knockoutStages.map((stage) => [stage.key, stage.limit]));
  const totalRequired = groupMatchIds.size + groupNames.size + knockoutStages.length;

  const groupPredictionsByParticipant = new Map<string, Set<string>>();
  const { data: groupPredictions, error: groupPredictionsError } = await supabase
    .from("predictions")
    .select("participant_id, match_id")
    .in("match_id", Array.from(groupMatchIds));

  if (groupPredictionsError) {
    return NextResponse.json({ error: groupPredictionsError.message }, { status: 500 });
  }

  (groupPredictions ?? []).forEach((prediction) => {
    const participantPredictions = groupPredictionsByParticipant.get(prediction.participant_id) ?? new Set<string>();
    participantPredictions.add(prediction.match_id);
    groupPredictionsByParticipant.set(prediction.participant_id, participantPredictions);
  });

  const groupPositionsByParticipant = new Map<string, Set<string>>();
  (groupPositions ?? []).forEach((prediction) => {
    const participantPredictions = groupPositionsByParticipant.get(prediction.participant_id) ?? new Set<string>();
    participantPredictions.add(`${prediction.group_name}:${prediction.position}`);
    groupPositionsByParticipant.set(prediction.participant_id, participantPredictions);
  });

  const knockoutByParticipant = new Map<string, Map<string, Set<string>>>();
  (knockoutPredictions ?? []).forEach((prediction) => {
    const participantStages = knockoutByParticipant.get(prediction.participant_id) ?? new Map<string, Set<string>>();
    const stagePredictions = participantStages.get(prediction.stage) ?? new Set<string>();
    stagePredictions.add(prediction.team_name);
    participantStages.set(prediction.stage, stagePredictions);
    knockoutByParticipant.set(prediction.participant_id, participantStages);
  });

  const participants = (data ?? []).map((participant) => {
    const groupPredictionsCount = groupPredictionsByParticipant.get(participant.id)?.size ?? 0;
    const groupPositionStagesCount = Array.from(groupNames).filter((groupName) => {
      const predictions = groupPositionsByParticipant.get(participant.id) ?? new Set<string>();
      return predictions.has(`${groupName}:1`) && predictions.has(`${groupName}:2`);
    }).length;
    const knockoutStagesCount = knockoutStages.filter((stage) => {
      const predictions = knockoutByParticipant.get(participant.id)?.get(stage.key);
      return (predictions?.size ?? 0) >= (knockoutLimits.get(stage.key) ?? 0);
    }).length;
    const filled = groupPredictionsCount + groupPositionStagesCount + knockoutStagesCount;

    return {
      ...participant,
      completion_filled: filled,
      completion_total: totalRequired,
      completion_missing: Math.max(totalRequired - filled, 0),
      completion_complete: totalRequired > 0 && filled === totalRequired,
    };
  });

  return NextResponse.json({ participants });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await request.json();
  const input = validateParticipantInput(body.name, body.pin);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .insert({
      name: input.cleanName,
      pin_hash: hashPin(input.cleanPin),
      deleted_at: null,
    })
    .select("id, name, created_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participant: data });
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Participante obrigatorio." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  if (body.restore === true) {
    const { data, error } = await supabase
      .from("participants")
      .update({ deleted_at: null })
      .eq("id", body.id)
      .select("id, name, created_at, deleted_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participant: data });
  }

  const input = validateParticipantInput(body.name, body.pin);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("participants")
    .update({
      name: input.cleanName,
      pin_hash: hashPin(input.cleanPin),
      deleted_at: null,
    })
    .eq("id", body.id)
    .select("id, name, created_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participant: data });
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Participante obrigatorio." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", body.id)
    .select("id, name, created_at, deleted_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participant: data });
}
