import { NextRequest, NextResponse } from "next/server";
import { getProductById } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get("productId");
    if (!productId) {
      return NextResponse.json({ ok: false, error: "Не указан товар." }, { status: 400 });
    }

    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json({ ok: false, error: "Позиция не найдена в SQLite." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось открыть карточку.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
