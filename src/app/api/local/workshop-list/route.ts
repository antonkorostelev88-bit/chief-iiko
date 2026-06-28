import { NextRequest, NextResponse } from "next/server";
import { deleteWorkshopDefinition, readWorkshopDefinitions, saveWorkshopDefinition } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...readWorkshopDefinitions() });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string };
    const result = saveWorkshopDefinition({ name: body.name ?? "" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить цех." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: number };
    const result = deleteWorkshopDefinition({ id: Number(body.id) });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось удалить цех." }, { status: 400 });
  }
}
