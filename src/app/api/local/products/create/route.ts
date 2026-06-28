import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createLocalProduct } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ingredientSchema = z.object({
  ingredientId: z.string().min(1),
  grossQuantity: z.number().nullable().optional(),
  unit: z.string().optional(),
});

const createProductSchema = z.object({
  kind: z.enum(["other", "semifinished", "dish"]),
  name: z.string().trim().min(1, "Укажите название."),
  category: z.string().optional(),
  article: z.string().optional(),
  code: z.string().optional(),
  measureUnit: z.string().optional(),
  price: z.number().nullable().optional(),
  ingredients: z.array(ingredientSchema).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = createProductSchema.parse(await request.json());
    const product = createLocalProduct({
      kind: body.kind,
      name: body.name,
      category: body.category,
      article: body.article,
      code: body.code,
      measureUnit: body.measureUnit,
      price: body.price,
      ingredients: body.kind === "dish" ? (body.ingredients ?? []).map((ingredient) => ({ ingredientId: ingredient.ingredientId, grossQuantity: ingredient.grossQuantity ?? null, unit: ingredient.unit })) : [],
    });

    if (!product) {
      return NextResponse.json({ ok: false, error: "Не удалось создать позицию." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить позицию.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
