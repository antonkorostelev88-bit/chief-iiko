import { NextResponse } from "next/server";
import { deleteGoodsNotUsedInDishes } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = deleteGoodsNotUsedInDishes();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось очистить лишние товары." }, { status: 400 });
  }
}
