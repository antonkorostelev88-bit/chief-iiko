import { NextRequest, NextResponse } from "next/server";
import { setProductArchived } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { productId?: string; archived?: boolean };
    if (!body.productId) {
      return NextResponse.json({ ok: false, error: "Позиция не указана." }, { status: 400 });
    }
    const product = setProductArchived(body.productId, Boolean(body.archived));
    if (!product) {
      return NextResponse.json({ ok: false, error: "Позиция не найдена." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось изменить архив." }, { status: 400 });
  }
}
