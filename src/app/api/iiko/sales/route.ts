import { NextRequest, NextResponse } from "next/server";
import { getDbPath, readLocalSales, saveIikoSales } from "@/lib/db";
import { fetchIikoSalesReport, IikoError } from "@/lib/iiko";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("iiko_token")?.value;
  const baseUrl = request.cookies.get("iiko_base_url")?.value;

  if (!token || !baseUrl) {
    return NextResponse.json({ ok: false, error: "Сначала войдите в iiko." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { dateFrom?: string; dateTo?: string };
    const dateFrom = validDate(body.dateFrom) ? body.dateFrom! : today();
    const dateTo = validDate(body.dateTo) ? body.dateTo! : dateFrom;
    const report = await fetchIikoSalesReport({ baseUrl, token, dateFrom, dateTo });
    const sync = saveIikoSales({ source: baseUrl, dateFrom, dateTo, rows: report.rows, rawPayload: report.rawPayload });
    return NextResponse.json({ ok: true, sync: { ...sync, endpoint: report.endpoint }, ...readLocalSales() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось загрузить продажи из iiko.";
    const status = error instanceof IikoError ? error.status : 500;
    return NextResponse.json({ ok: false, error: message, dbPath: getDbPath() }, { status });
  }
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
