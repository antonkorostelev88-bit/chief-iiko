import { NextRequest, NextResponse } from "next/server";
import { IikoError, fetchSemiFinishedProducts } from "@/lib/iiko";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("iiko_token")?.value;
  const baseUrl = request.cookies.get("iiko_base_url")?.value;

  if (!token || !baseUrl) {
    return NextResponse.json(
      { ok: false, error: "Сначала войдите в iiko." },
      { status: 401 },
    );
  }

  try {
    const products = await fetchSemiFinishedProducts(baseUrl, token);
    return NextResponse.json({ ok: true, ...products });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Не удалось получить полуфабрикаты.";
    const status = error instanceof IikoError ? error.status : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
