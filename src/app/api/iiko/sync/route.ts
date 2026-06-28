import { NextRequest, NextResponse } from "next/server";
import { getDbPath, readLocalProducts, saveIikoSnapshot } from "@/lib/db";
import { fetchFullIikoSnapshot, IikoError } from "@/lib/iiko";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("iiko_token")?.value;
  const baseUrl = request.cookies.get("iiko_base_url")?.value;

  if (!token || !baseUrl) {
    return NextResponse.json(
      { ok: false, error: "Сначала войдите в iiko, потом запустите синхронизацию." },
      { status: 401 },
    );
  }

  try {
    const snapshot = await fetchFullIikoSnapshot(baseUrl, token);
    const sync = saveIikoSnapshot({ source: baseUrl, snapshot });
    return NextResponse.json({ ok: true, sync, ...readLocalProducts() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось синхронизировать данные iiko.";
    const status = error instanceof IikoError ? error.status : 500;
    return NextResponse.json({ ok: false, error: message, dbPath: getDbPath() }, { status });
  }
}
