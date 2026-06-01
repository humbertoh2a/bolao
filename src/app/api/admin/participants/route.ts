import { NextResponse } from "next/server";
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
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participants: data ?? [] });
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
    })
    .select("id, name, created_at")
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
  const input = validateParticipantInput(body.name, body.pin);
  if (!body.id) {
    return NextResponse.json({ error: "Participante obrigatorio." }, { status: 400 });
  }
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .update({
      name: input.cleanName,
      pin_hash: hashPin(input.cleanPin),
    })
    .eq("id", body.id)
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participant: data });
}
