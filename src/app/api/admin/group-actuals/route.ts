import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

function isAuthorized(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  return Boolean(adminPassword && request.headers.get("x-admin-password") === adminPassword);
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await request.json();
  const groupName = String(body.group_name ?? "").trim();
  const firstPlace = String(body.first_place ?? "").trim();
  const secondPlace = String(body.second_place ?? "").trim();

  if (!groupName || !firstPlace || !secondPlace) {
    return NextResponse.json({ error: "Grupo, 1º e 2º sao obrigatorios." }, { status: 400 });
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

  const { error: deleteError } = await supabase
    .from("group_position_actuals")
    .delete()
    .eq("group_name", groupName);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("group_position_actuals").insert([
    { group_name: groupName, position: 1, team_name: firstPlace },
    { group_name: groupName, position: 2, team_name: secondPlace },
  ]);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
