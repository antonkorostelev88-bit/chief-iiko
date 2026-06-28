import { NextResponse } from "next/server";
import { readLocalProducts } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...readLocalProducts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось прочитать локальную базу.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
