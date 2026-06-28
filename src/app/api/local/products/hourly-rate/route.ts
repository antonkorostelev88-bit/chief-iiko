import { NextRequest, NextResponse } from "next/server";
import { setHourlyRateForSemifinished } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { hourlyRate?: number | null };
    const result = setHourlyRateForSemifinished(body.hourlyRate ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось проставить ставку." }, { status: 400 });
  }
}
