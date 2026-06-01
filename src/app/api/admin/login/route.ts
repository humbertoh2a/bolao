import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD nao configurada." }, { status: 500 });
  }

  if (password !== adminPassword) {
    return NextResponse.json({ error: "Senha invalida." }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
