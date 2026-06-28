import { NextRequest, NextResponse } from "next/server";
import { deleteProductForever } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { productId?: string };
    if (!body.productId) {
      return NextResponse.json({ ok: false, error: "Позиция не указана." }, { status: 400 });
    }
    const deleted = deleteProductForever(body.productId);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Позиция не найдена." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось удалить позицию." }, { status: 400 });
  }
}
