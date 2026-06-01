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
  const homeScore = body.home_score === "" || body.home_score === null ? null : Number(body.home_score);
  const awayScore = body.away_score === "" || body.away_score === null ? null : Number(body.away_score);
  const status = body.status === "finished" ? "finished" : "scheduled";

  if (!body.id) {
    return NextResponse.json({ error: "Jogo obrigatorio." }, { status: 400 });
  }

  if (
    (homeScore !== null && (!Number.isInteger(homeScore) || homeScore < 0)) ||
    (awayScore !== null && (!Number.isInteger(awayScore) || awayScore < 0))
  ) {
    return NextResponse.json({ error: "Placar invalido." }, { status: 400 });
  }

  if (status === "finished" && (homeScore === null || awayScore === null)) {
    return NextResponse.json({ error: "Resultado final precisa dos dois placares." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("matches")
    .update({
      home_score: status === "finished" ? homeScore : null,
      away_score: status === "finished" ? awayScore : null,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ match: data });
}
