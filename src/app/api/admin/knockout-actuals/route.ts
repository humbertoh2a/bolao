import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getStageLimit, isKnockoutStage } from "@/lib/knockout";

function isAuthorized(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && request.headers.get("x-admin-password") === adminPassword);
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await request.json();
  const stage = String(body.stage ?? "");
  const teams = Array.isArray(body.team_names)
    ? [...new Set(body.team_names.map((team: unknown) => String(team).trim()).filter(Boolean))]
    : [];

  if (!isKnockoutStage(stage)) {
    return NextResponse.json({ error: "Fase invalida." }, { status: 400 });
  }

  const limit = getStageLimit(stage);
  if (teams.length > limit) {
    return NextResponse.json({ error: `Escolha no maximo ${limit} selecoes.` }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { error: deleteError } = await supabase.from("knockout_actuals").delete().eq("stage", stage);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (teams.length > 0) {
    const { error: insertError } = await supabase
      .from("knockout_actuals")
      .insert(teams.map((team) => ({ stage, team_name: team })));

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
