import { NextResponse } from "next/server";
import { hashPin } from "@/lib/pin";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const { name, pin } = await request.json();
  const cleanName = String(name ?? "").trim();
  const cleanPin = String(pin ?? "").trim();

  if (!cleanName || !cleanPin) {
    return NextResponse.json({ error: "Informe nome e PIN." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("participants")
    .select("id, name, pin_hash")
    .ilike("name", cleanName)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.pin_hash !== hashPin(cleanPin)) {
    return NextResponse.json({ error: "Nome ou PIN invalido." }, { status: 401 });
  }

  return NextResponse.json({ participant: { id: data.id, name: data.name } });
}
