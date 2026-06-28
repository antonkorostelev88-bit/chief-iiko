import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveProductSettings } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  productId: z.string().min(1),
  operationName: z.string().optional(),
  batchVolume: z.number().nullable().optional(),
  batchUnit: z.string().optional(),
  batchTimeMinutes: z.number().nullable().optional(),
  yieldAmount: z.number().nullable().optional(),
  yieldUnit: z.string().optional(),
  laborMinutes: z.number().nullable().optional(),
  hourlyRate: z.number().nullable().optional(),
  note: z.string().optional(),
  category: z.string().optional(),
  recipeItems: z.array(z.object({ ingredientId: z.string().min(1), grossQuantity: z.number().nullable().optional(), unit: z.string().optional() })).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = settingsSchema.parse(await request.json());
    const product = saveProductSettings(body.productId, {
      operationName: body.operationName,
      batchVolume: body.batchVolume,
      batchUnit: body.batchUnit,
      batchTimeMinutes: body.batchTimeMinutes,
      yieldAmount: body.yieldAmount,
      yieldUnit: body.yieldUnit,
      laborMinutes: body.laborMinutes,
      hourlyRate: body.hourlyRate,
      note: body.note,
      category: body.category,
      recipeItems: body.recipeItems?.map((item) => ({ ingredientId: item.ingredientId, grossQuantity: item.grossQuantity ?? null, unit: item.unit })),
    });

    if (!product) {
      return NextResponse.json({ ok: false, error: "РџРѕР·РёС†РёСЏ РЅРµ РЅР°Р№РґРµРЅР° РІ Р»РѕРєР°Р»СЊРЅРѕР№ Р±Р°Р·Рµ." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РґР°РЅРЅС‹Рµ.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}



