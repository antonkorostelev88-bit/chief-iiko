import { NextRequest, NextResponse } from "next/server";
import { readWorkshopMappings, saveWorkshopMapping } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ...readWorkshopMappings() });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { productionPlace?: string; workshop?: string; position?: string };
    const result = saveWorkshopMapping({
      productionPlace: body.productionPlace ?? "",
      workshop: body.workshop ?? "",
      position: body.position,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить цех." }, { status: 400 });
  }
}
