import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  buildProductSummary,
  IikoRawPayload,
  IikoRecipe,
  IikoReference,
  IikoSale,
  IikoSyncData,
  Product,
  ProductionSettings,
  RecipeIngredient,
} from "@/lib/iiko";

export type ProductSettingsInput = ProductionSettings & {
  productName?: string;
  kind?: Product["kind"];
  type?: string;
  article?: string;
  price?: number | null;
  productionPlace?: string;
  category?: string;
  recipeItems?: LocalRecipeIngredientInput[];
};

export type LocalRecipeIngredientInput = {
  ingredientId: string;
  grossQuantity: number | null;
  netQuantity?: number | null;
  unit?: string;
};

export type LocalProductInput = {
  kind: Product["kind"];
  name: string;
  category?: string;
  article?: string;
  code?: string;
  measureUnit?: string;
  price?: number | null;
  ingredients?: LocalRecipeIngredientInput[];
};

export type LocalProductList = {
  items: Product[];
  totalFound: number;
  filtered: boolean;
  summary: ReturnType<typeof buildProductSummary>;
  dashboard: {
    products: number;
    dishes: number;
    semifinished: number;
    goods: number;
    recipes: number;
    categories: number;
    revenueTotal: number | null;
    revenueKitchen: number | null;
    revenueBar: number | null;
  };
  lastSync?: {
    id: number;
    finishedAt: string;
    source: string;
    totalProducts: number;
    totalRecipes: number;
  };
  dbPath: string;
};

export type LocalSalesRow = {
  id: string;
  date?: string;
  dishName: string;
  productId?: string;
  category?: string;
  department?: string;
  amount: number;
  revenue: number;
  concept?: string;
  code?: string;
  group?: string;
  avgPrice?: number;
  avgPriceNoDiscount?: number;
  revenueNoDiscount?: number;
  grossProfit?: number;
  markupPercent?: number;
  discountSum?: number;
  costPerUnit?: number;
  costTotal?: number;
  costPercent?: number;
  syncedAt: string;
};

export type WorkshopMapping = {
  productionPlace: string;
  workshop: string;
  position?: string;
  updatedAt?: string;
};

export type WorkshopDefinition = {
  id: number;
  name: string;
  updatedAt?: string;
};

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "iiko-chef.sqlite");

let database: DatabaseSync | undefined;

export function getDbPath() {
  return dbPath;
}

export function getDb() {
  if (!database) {
    fs.mkdirSync(dataDir, { recursive: true });
    database = new DatabaseSync(dbPath);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA foreign_keys = ON");
    migrate(database);
  }

  return database;
}

export function saveIikoSnapshot(params: { source: string; snapshot: IikoSyncData }) {
  const db = getDb();
  const now = new Date().toISOString();
  const run = db
    .prepare(
      "INSERT INTO sync_runs (started_at, finished_at, source, status, total_products, total_recipes) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(now, now, params.source, "success", params.snapshot.products.length, params.snapshot.recipes.length);
  const runId = Number(run.lastInsertRowid);

  db.exec("BEGIN");
  try {
    saveReferences(db, params.snapshot.references, now);
    saveRawPayloads(db, params.snapshot.rawPayloads, now);
    saveProducts(db, params.snapshot.products, now);
    saveRecipes(db, params.snapshot.recipes, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.prepare("UPDATE sync_runs SET status = ?, error = ? WHERE id = ?").run(
      "error",
      error instanceof Error ? error.message : String(error),
      runId,
    );
    throw error;
  }

  return {
    runId,
    syncedAt: now,
    saved: params.snapshot.products.length,
    recipes: params.snapshot.recipes.length,
    references: params.snapshot.references.length,
    dbPath,
  };
}

export function saveIikoProducts(params: { source: string; products: Product[] }) {
  return saveIikoSnapshot({
    source: params.source,
    snapshot: { products: params.products, references: [], recipes: [], rawPayloads: [] },
  });
}

export function saveProductSettings(productId: string, settings: ProductSettingsInput) {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    if (settings.category !== undefined) {
      const category = emptyToNull(settings.category);
      db.prepare(
        "UPDATE iiko_products SET category = ?, group_name = ?, category_name = ?, group_display_name = ? WHERE id = ?",
      ).run(category, category, category, category, productId);
    }

    const productPatch = db.prepare(
      "SELECT name, kind, type, article, price, raw_json FROM iiko_products WHERE id = ?",
    ).get(productId) as { name: string; kind: Product["kind"]; type: string | null; article: string | null; price: number | null; raw_json: string } | undefined;
    if (productPatch) {
      const productionPlace = emptyToNull(settings.productionPlace);
      const rawJson = settings.productionPlace !== undefined ? writeTextToRaw(productPatch.raw_json, "Тип места приготовления", productionPlace) : productPatch.raw_json;
      db.prepare(
        "UPDATE iiko_products SET name = ?, kind = ?, type = ?, article = ?, price = ?, raw_json = ? WHERE id = ?",
      ).run(
        emptyToNull(settings.productName) ?? productPatch.name,
        settings.kind ?? productPatch.kind,
        emptyToNull(settings.type) ?? productPatch.type,
        settings.article !== undefined ? emptyToNull(settings.article) : productPatch.article,
        settings.price !== undefined ? numberOrNull(settings.price) : productPatch.price,
        rawJson,
        productId,
      );
    }

    db.prepare(
      "INSERT INTO product_production_settings (" +
        "product_id, operation_name, batch_volume, batch_unit, batch_time_minutes, yield_amount, yield_unit, labor_minutes, hourly_rate, recipe_effective_from, note, updated_at" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(product_id) DO UPDATE SET " +
        "operation_name = excluded.operation_name, batch_volume = excluded.batch_volume, batch_unit = excluded.batch_unit, " +
        "batch_time_minutes = excluded.batch_time_minutes, yield_amount = excluded.yield_amount, yield_unit = excluded.yield_unit, " +
        "labor_minutes = excluded.labor_minutes, hourly_rate = excluded.hourly_rate, recipe_effective_from = excluded.recipe_effective_from, note = excluded.note, updated_at = excluded.updated_at",
    ).run(
      productId,
      emptyToNull(settings.operationName),
      numberOrNull(settings.batchVolume),
      emptyToNull(settings.batchUnit),
      numberOrNull(settings.batchTimeMinutes),
      numberOrNull(settings.yieldAmount),
      emptyToNull(settings.yieldUnit),
      numberOrNull(settings.laborMinutes),
      numberOrNull(settings.hourlyRate),
      emptyToNull(settings.recipeEffectiveFrom),
      emptyToNull(settings.note),
      now,
    );

    db.prepare(
      "INSERT INTO product_production_settings (product_id, batch_volume, batch_unit, batch_time_minutes, hourly_rate, updated_at) " +
        "SELECT id, ?, ?, ?, ?, ? FROM iiko_products WHERE name = (SELECT name FROM iiko_products WHERE id = ?) AND id <> ? " +
        "ON CONFLICT(product_id) DO UPDATE SET " +
        "batch_volume = excluded.batch_volume, batch_unit = excluded.batch_unit, " +
        "batch_time_minutes = excluded.batch_time_minutes, hourly_rate = excluded.hourly_rate, updated_at = excluded.updated_at",
    ).run(
      numberOrNull(settings.batchVolume),
      emptyToNull(settings.batchUnit),
      numberOrNull(settings.batchTimeMinutes),
      numberOrNull(settings.hourlyRate),
      now,
      productId,
      productId,
    );

    if (settings.recipeItems) {
      db.prepare("DELETE FROM local_recipe_items WHERE dish_product_id = ?").run(productId);
      const insertIngredient = db.prepare(
        "INSERT INTO local_recipe_items (dish_product_id, ingredient_product_id, gross_quantity, net_quantity, unit, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const [index, ingredient] of settings.recipeItems.entries()) {
        if (!ingredient.ingredientId) continue;
        insertIngredient.run(productId, ingredient.ingredientId, numberOrNull(ingredient.grossQuantity), numberOrNull(ingredient.netQuantity), emptyToNull(ingredient.unit), index, now);
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getProductById(productId);
}

export function createLocalProduct(input: LocalProductInput) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = "local-" + randomUUID();
  const name = input.name.trim();
  const category = emptyToNull(input.category);
  const measureUnit = emptyToNull(input.measureUnit);
  const rawJson = JSON.stringify({ source: "local", isLocal: true, ingredients: input.ingredients ?? [] });

  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO iiko_products (" +
        "id, name, kind, type, article, code, measure_unit, category, group_name, category_id, category_name, group_id, group_display_name, price, raw_json, synced_at, is_local" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      name,
      input.kind,
      input.kind === "dish" ? "DISH" : null,
      emptyToNull(input.article),
      emptyToNull(input.code),
      measureUnit,
      category,
      category,
      null,
      category,
      null,
      category,
      numberOrNull(input.price),
      rawJson,
      now,
      1,
    );

    if (input.kind === "dish") {
      const insertIngredient = db.prepare(
        "INSERT INTO local_recipe_items (dish_product_id, ingredient_product_id, gross_quantity, unit, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const [index, ingredient] of (input.ingredients ?? []).entries()) {
        if (!ingredient.ingredientId) continue;
        insertIngredient.run(id, ingredient.ingredientId, numberOrNull(ingredient.grossQuantity), emptyToNull(ingredient.unit), index, now);
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getProductById(id);
}

export function saveIikoSales(params: { source: string; dateFrom: string; dateTo: string; rows: IikoSale[]; rawPayload?: IikoRawPayload }) {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM iiko_sales WHERE sale_date >= ? AND sale_date <= ?").run(params.dateFrom, params.dateTo);
    const insert = db.prepare(
      "INSERT INTO iiko_sales (" +
        "id, sale_date, dish_name, product_id, category, department, amount, revenue, concept, code, group_name, " +
        "avg_price, avg_price_no_discount, revenue_no_discount, gross_profit, markup_percent, discount_sum, cost_per_unit, cost_total, cost_percent, raw_json, synced_at" +
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const row of params.rows) {
      const raw = parseSalesRaw(row.rawJson);
      insert.run(
        row.id,
        normalizeSaleDate(row.date) ?? params.dateFrom,
        row.dishName,
        emptyToNull(row.productId),
        emptyToNull(row.category),
        emptyToNull(row.department),
        numberOrNull(row.amount) ?? 0,
        numberOrNull(row.revenue) ?? 0,
        emptyToNull(row.department) ?? emptyToNull(readRawText(raw, "concept")),
        emptyToNull(readRawText(raw, "code")),
        emptyToNull(readRawText(raw, "group")),
        numberOrNull(readRawNumber(raw, "avgPrice")),
        numberOrNull(readRawNumber(raw, "avgPriceNoDiscount")),
        numberOrNull(readRawNumber(raw, "revenueNoDiscount")),
        numberOrNull(readRawNumber(raw, "grossProfit")),
        numberOrNull(readRawNumber(raw, "markupPercent")),
        numberOrNull(readRawNumber(raw, "discountSum")),
        numberOrNull(readRawNumber(raw, "costPerUnit")),
        numberOrNull(readRawNumber(raw, "costTotal")),
        numberOrNull(readRawNumber(raw, "costPercent")),
        row.rawJson,
        now,
      );
    }
    if (params.rawPayload) saveRawPayloads(db, [params.rawPayload], now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { saved: params.rows.length, syncedAt: now, dbPath };
}

export function readLocalSales(): { items: LocalSalesRow[]; total: number; revenueTotal: number; dbPath: string } {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, sale_date, dish_name, product_id, category, department, amount, revenue, synced_at " +
        ", concept, code, group_name, avg_price, avg_price_no_discount, revenue_no_discount, gross_profit, markup_percent, discount_sum, cost_per_unit, cost_total, cost_percent " +
        "FROM iiko_sales ORDER BY sale_date DESC, department, dish_name",
    )
    .all() as LocalSalesDbRow[];
  const items = rows.map((row) => ({
    id: row.id,
    date: row.sale_date ?? undefined,
    dishName: row.dish_name,
    productId: row.product_id ?? undefined,
    category: row.category ?? undefined,
    department: row.department ?? undefined,
    amount: row.amount,
    revenue: row.revenue,
    concept: row.concept ?? undefined,
    code: row.code ?? undefined,
    group: row.group_name ?? undefined,
    avgPrice: row.avg_price ?? undefined,
    avgPriceNoDiscount: row.avg_price_no_discount ?? undefined,
    revenueNoDiscount: row.revenue_no_discount ?? undefined,
    grossProfit: row.gross_profit ?? undefined,
    markupPercent: row.markup_percent ?? undefined,
    discountSum: row.discount_sum ?? undefined,
    costPerUnit: row.cost_per_unit ?? undefined,
    costTotal: row.cost_total ?? undefined,
    costPercent: row.cost_percent ?? undefined,
    syncedAt: row.synced_at,
  }));
  return {
    items,
    total: items.length,
    revenueTotal: items.reduce((sum, row) => sum + row.revenue, 0),
    dbPath,
  };
}

export function readWorkshopMappings(): { items: WorkshopMapping[]; dbPath: string } {
  const db = getDb();
  const rows = db
    .prepare("SELECT production_place, workshop, position, updated_at FROM production_place_workshops ORDER BY production_place")
    .all() as WorkshopMappingRow[];
  return {
    items: rows.map((row) => ({
      productionPlace: row.production_place,
      workshop: row.workshop,
      position: row.position ?? undefined,
      updatedAt: row.updated_at,
    })),
    dbPath,
  };
}

export function readWorkshopDefinitions(): { items: WorkshopDefinition[]; dbPath: string } {
  const db = getDb();
  seedWorkshopDefinitions(db);
  const rows = db.prepare("SELECT id, name, updated_at FROM workshops ORDER BY name").all() as WorkshopDefinitionRow[];
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
    })),
    dbPath,
  };
}

export function saveWorkshopDefinition(input: { name: string }) {
  const db = getDb();
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) throw new Error("Название цеха не указано.");
  db.prepare(
    "INSERT INTO workshops (name, updated_at) VALUES (?, ?) " +
      "ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at",
  ).run(name, now);
  return readWorkshopDefinitions();
}

export function deleteWorkshopDefinition(input: { id: number }) {
  const db = getDb();
  const row = db.prepare("SELECT name FROM workshops WHERE id = ?").get(input.id) as { name: string } | undefined;
  if (!row) throw new Error("Цех не найден.");

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE production_place_workshops SET workshop = '', updated_at = ? WHERE workshop = ?").run(new Date().toISOString(), row.name);
    db.prepare("DELETE FROM workshops WHERE id = ?").run(input.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readWorkshopDefinitions();
}

export function saveWorkshopMapping(input: { productionPlace: string; workshop: string; position?: string }) {
  const db = getDb();
  const now = new Date().toISOString();
  const productionPlace = input.productionPlace.trim();
  if (!productionPlace) throw new Error("Тип места приготовления не указан.");
  const workshop = input.workshop.trim();
  if (workshop) {
    const exists = db.prepare("SELECT id FROM workshops WHERE name = ?").get(workshop);
    if (!exists) throw new Error("Выберите цех из списка.");
  }
  db.prepare(
    "INSERT INTO production_place_workshops (production_place, workshop, position, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(production_place) DO UPDATE SET workshop = excluded.workshop, position = excluded.position, updated_at = excluded.updated_at",
  ).run(productionPlace, workshop, emptyToNull(input.position), now);
  return readWorkshopMappings();
}

export function setProductArchived(productId: string, archived: boolean) {
  const db = getDb();
  db.prepare("UPDATE iiko_products SET is_archived = ? WHERE id = ?").run(archived ? 1 : 0, productId);
  return getProductById(productId);
}

export function setHourlyRateForSemifinished(hourlyRate: number | null) {
  const db = getDb();
  const now = new Date().toISOString();
  const productIds = db.prepare("SELECT id FROM iiko_products WHERE kind = ?").all("semifinished") as { id: string }[];
  const save = db.prepare(
    "INSERT INTO product_production_settings (product_id, hourly_rate, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(product_id) DO UPDATE SET hourly_rate = excluded.hourly_rate, updated_at = excluded.updated_at",
  );

  db.exec("BEGIN");
  try {
    for (const item of productIds) {
      save.run(item.id, numberOrNull(hourlyRate), now);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { updated: productIds.length, dbPath };
}

export function deleteGoodsNotUsedInDishes() {
  const db = getDb();
  const referenceMap = readReferenceMap(db);
  const backupPath = path.join(dataDir, "iiko-chef.before-unused-goods-cleanup." + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite");
  db.exec("VACUUM INTO '" + backupPath.replace(/'/g, "''") + "'");

  const rows = db
    .prepare(
      "SELECT id, name, kind, type, article, code, measure_unit, category, group_name, category_id, category_name, group_id, group_display_name, price, raw_json, is_local, " +
        "is_archived, " +
        "operation_name, batch_volume, batch_unit, batch_time_minutes, yield_amount, yield_unit, labor_minutes, hourly_rate, recipe_effective_from, note " +
        "FROM iiko_products " +
        "LEFT JOIN product_production_settings ON product_production_settings.product_id = iiko_products.id",
    )
    .all() as LocalProductRow[];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const usedIngredientIds = new Set<string>();
  const visitedRecipeProductIds = new Set<string>();

  function walkRecipe(productId: string) {
    if (visitedRecipeProductIds.has(productId)) return;
    visitedRecipeProductIds.add(productId);
    const row = rowsById.get(productId);
    if (!row) return;
    const recipe = readRecipeForProduct(db, row, referenceMap);
    for (const item of recipe?.items ?? []) {
      if (!item.ingredientId) continue;
      usedIngredientIds.add(item.ingredientId);
      const ingredientRow = rowsById.get(item.ingredientId);
      if (ingredientRow?.kind === "semifinished") walkRecipe(ingredientRow.id);
    }
  }

  for (const row of rows) {
    if (row.kind === "dish") walkRecipe(row.id);
  }

  const unusedGoods = rows.filter((row) => row.kind === "other" && !usedIngredientIds.has(row.id));

  db.exec("BEGIN");
  try {
    const deleteSettings = db.prepare("DELETE FROM product_production_settings WHERE product_id = ?");
    const deleteRecipes = db.prepare("DELETE FROM iiko_recipes WHERE product_id = ?");
    const deleteRecipeRows = db.prepare("DELETE FROM local_recipe_items WHERE dish_product_id = ? OR ingredient_product_id = ?");
    const deleteProduct = db.prepare("DELETE FROM iiko_products WHERE id = ?");
    for (const row of unusedGoods) {
      deleteRecipeRows.run(row.id, row.id);
      deleteSettings.run(row.id);
      deleteRecipes.run(row.id);
      deleteProduct.run(row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  db.exec("PRAGMA optimize");
  return { deleted: unusedGoods.length, keptIngredientGoods: usedIngredientIds.size, backupPath, dbPath };
}

export function deleteProductForever(productId: string) {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM local_recipe_items WHERE dish_product_id = ? OR ingredient_product_id = ?").run(productId, productId);
    db.prepare("DELETE FROM product_production_settings WHERE product_id = ?").run(productId);
    db.prepare("DELETE FROM iiko_recipes WHERE product_id = ?").run(productId);
    const result = db.prepare("DELETE FROM iiko_products WHERE id = ?").run(productId);
    db.exec("COMMIT");
    return Number(result.changes) > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getProductById(productId: string) {
  const db = getDb();
  const referenceMap = readReferenceMap(db);
  const row = db
    .prepare(
      "SELECT id, name, kind, type, article, code, measure_unit, category, group_name, category_id, category_name, group_id, group_display_name, price, raw_json, is_local, " +
        "is_archived, " +
        "operation_name, batch_volume, batch_unit, batch_time_minutes, yield_amount, yield_unit, labor_minutes, hourly_rate, recipe_effective_from, note " +
        "FROM iiko_products " +
        "LEFT JOIN product_production_settings ON product_production_settings.product_id = iiko_products.id " +
        "WHERE iiko_products.id = ?",
    )
    .get(productId) as LocalProductRow | undefined;

  if (!row) return undefined;
  const product = rowToProduct(row, referenceMap);
  const recipe = readRecipeForProduct(db, row, referenceMap);
  return recipe ? { ...product, recipe } : product;
}

export function readLocalProducts(): LocalProductList {
  const db = getDb();
  const referenceMap = readReferenceMap(db);
  const rows = db
    .prepare(
      "SELECT id, name, kind, type, article, code, measure_unit, category, group_name, category_id, category_name, group_id, group_display_name, price, raw_json, is_local, " +
        "is_archived, " +
        "operation_name, batch_volume, batch_unit, batch_time_minutes, yield_amount, yield_unit, labor_minutes, hourly_rate, recipe_effective_from, note " +
        "FROM iiko_products " +
        "LEFT JOIN product_production_settings ON product_production_settings.product_id = iiko_products.id " +
        "ORDER BY kind, group_display_name, category_name, name",
    )
    .all() as LocalProductRow[];
  const products = rows.map((row) => rowToProduct(row, referenceMap));
  const iikoRecipeCount = Number((db.prepare("SELECT COUNT(*) AS count FROM iiko_recipes").get() as CountRow).count);
  const localRecipeCount = Number((db.prepare("SELECT COUNT(DISTINCT dish_product_id) AS count FROM local_recipe_items").get() as CountRow).count);
  const recipeCount = iikoRecipeCount + localRecipeCount;
  const referenceCount = Number((db.prepare("SELECT COUNT(*) AS count FROM iiko_references").get() as CountRow).count);
  const lastSyncRow = db
    .prepare(
      "SELECT id, finished_at, source, total_products, total_recipes " +
        "FROM sync_runs " +
        "WHERE status = 'success' " +
        "ORDER BY id DESC " +
        "LIMIT 1",
    )
    .get() as LastSyncRow | undefined;
  const summary = buildProductSummary(products);
  const revenueRow = db.prepare("SELECT COALESCE(SUM(revenue), 0) AS revenue FROM iiko_sales").get() as { revenue: number } | undefined;

  return {
    items: products,
    totalFound: products.length,
    filtered: products.some((product) => product.kind !== "other"),
    summary,
    dashboard: {
      products: products.length,
      dishes: summary.dishes.total,
      semifinished: summary.semifinished.total,
      goods: summary.goods.total,
      recipes: recipeCount,
      categories: summary.allCategories.length,
      revenueTotal: revenueRow?.revenue ?? null,
      revenueKitchen: null,
      revenueBar: null,
    },
    lastSync: lastSyncRow
      ? {
          id: lastSyncRow.id,
          finishedAt: lastSyncRow.finished_at,
          source: lastSyncRow.source,
          totalProducts: lastSyncRow.total_products,
          totalRecipes: lastSyncRow.total_recipes,
        }
      : undefined,
    dbPath,
  };
}

function saveProducts(db: DatabaseSync, products: Product[], syncedAt: string) {
  const referenceMap = readReferenceMap(db);
  const upsert = db.prepare(
    "INSERT INTO iiko_products (" +
      "id, name, kind, type, article, code, measure_unit, category, group_name, category_id, category_name, group_id, group_display_name, price, raw_json, synced_at" +
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET " +
      "name = excluded.name, kind = excluded.kind, type = excluded.type, article = excluded.article, code = excluded.code, " +
      "measure_unit = excluded.measure_unit, category = excluded.category, group_name = excluded.group_name, " +
      "category_id = excluded.category_id, category_name = excluded.category_name, group_id = excluded.group_id, " +
      "group_display_name = excluded.group_display_name, price = excluded.price, raw_json = excluded.raw_json, synced_at = excluded.synced_at",
  );

  for (const product of products) {
    const categoryName = product.category ?? resolveReferenceName(referenceMap, product.categoryId);
    const groupName = product.group ?? resolveReferenceName(referenceMap, product.groupId);
    upsert.run(
      product.id,
      product.name,
      product.kind,
      product.type ?? null,
      product.article ?? null,
      product.code ?? null,
      product.measureUnit ?? null,
      product.categoryId ?? product.category ?? null,
      product.groupId ?? product.group ?? null,
      product.categoryId ?? null,
      categoryName ?? null,
      product.groupId ?? null,
      groupName ?? null,
      product.price ?? null,
      product.rawJson ?? "{}",
      syncedAt,
    );
  }
}

function saveReferences(db: DatabaseSync, references: IikoReference[], syncedAt: string) {
  const upsert = db.prepare(
    "INSERT INTO iiko_references (id, name, type, parent_id, raw_json, synced_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, parent_id = excluded.parent_id, raw_json = excluded.raw_json, synced_at = excluded.synced_at",
  );

  for (const reference of references) {
    upsert.run(reference.id, reference.name, reference.type, reference.parentId ?? null, reference.rawJson, syncedAt);
  }
}

function saveRecipes(db: DatabaseSync, recipes: IikoRecipe[], syncedAt: string) {
  const upsert = db.prepare(
    "INSERT INTO iiko_recipes (id, product_id, name, raw_json, synced_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET product_id = excluded.product_id, name = excluded.name, raw_json = excluded.raw_json, synced_at = excluded.synced_at",
  );

  for (const recipe of recipes) {
    upsert.run(recipe.id, recipe.productId ?? null, recipe.name ?? null, recipe.rawJson, syncedAt);
  }
}

function saveRawPayloads(db: DatabaseSync, payloads: IikoRawPayload[], syncedAt: string) {
  const insert = db.prepare(
    "INSERT INTO iiko_raw_payloads (endpoint, status, raw_json, synced_at) VALUES (?, ?, ?, ?)",
  );

  for (const payload of payloads) {
    insert.run(payload.endpoint, payload.status, payload.rawJson, syncedAt);
  }
}

function readReferenceMap(db: DatabaseSync) {
  const references = db.prepare("SELECT id, name FROM iiko_references").all() as ReferenceRow[];
  return new Map(references.map((reference) => [reference.id, reference.name]));
}

function resolveReferenceName(referenceMap: Map<string, string>, id?: string) {
  return id ? referenceMap.get(id) : undefined;
}

function migrate(db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS sync_runs (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "started_at TEXT NOT NULL," +
    "finished_at TEXT," +
    "source TEXT NOT NULL," +
    "status TEXT NOT NULL," +
    "total_products INTEGER NOT NULL DEFAULT 0," +
    "total_recipes INTEGER NOT NULL DEFAULT 0," +
    "error TEXT" +
  ")");

  addColumn(db, "sync_runs", "total_recipes", "INTEGER NOT NULL DEFAULT 0");

  db.exec("CREATE TABLE IF NOT EXISTS iiko_products (" +
    "id TEXT PRIMARY KEY," +
    "name TEXT NOT NULL," +
    "kind TEXT NOT NULL CHECK (kind IN ('semifinished', 'dish', 'other'))," +
    "type TEXT," +
    "article TEXT," +
    "code TEXT," +
    "measure_unit TEXT," +
    "category TEXT," +
    "group_name TEXT," +
    "category_id TEXT," +
    "category_name TEXT," +
    "group_id TEXT," +
    "group_display_name TEXT," +
    "price REAL," +
    "raw_json TEXT NOT NULL," +
    "synced_at TEXT NOT NULL" +
  ")");

  addColumn(db, "iiko_products", "article", "TEXT");
  addColumn(db, "iiko_products", "category_id", "TEXT");
  addColumn(db, "iiko_products", "category_name", "TEXT");
  addColumn(db, "iiko_products", "group_id", "TEXT");
  addColumn(db, "iiko_products", "group_display_name", "TEXT");
  addColumn(db, "iiko_products", "is_local", "INTEGER NOT NULL DEFAULT 0");
  addColumn(db, "iiko_products", "is_archived", "INTEGER NOT NULL DEFAULT 0");

  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_kind ON iiko_products(kind)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_kind_archived ON iiko_products(kind, is_archived)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_name ON iiko_products(name)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_article ON iiko_products(article)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_code ON iiko_products(code)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_category ON iiko_products(category_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_group ON iiko_products(group_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_category_name ON iiko_products(category_name)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_products_group_display_name ON iiko_products(group_display_name)");

  db.exec("CREATE TABLE IF NOT EXISTS iiko_references (" +
    "id TEXT PRIMARY KEY," +
    "name TEXT NOT NULL," +
    "type TEXT NOT NULL," +
    "parent_id TEXT," +
    "raw_json TEXT NOT NULL," +
    "synced_at TEXT NOT NULL" +
  ")");

  db.exec("CREATE TABLE IF NOT EXISTS iiko_recipes (" +
    "id TEXT PRIMARY KEY," +
    "product_id TEXT," +
    "name TEXT," +
    "raw_json TEXT NOT NULL," +
    "synced_at TEXT NOT NULL" +
  ")");

  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_recipes_product ON iiko_recipes(product_id)");

  db.exec("CREATE TABLE IF NOT EXISTS iiko_raw_payloads (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "endpoint TEXT NOT NULL," +
    "status INTEGER NOT NULL," +
    "raw_json TEXT NOT NULL," +
    "synced_at TEXT NOT NULL" +
  ")");

  db.exec("CREATE TABLE IF NOT EXISTS product_production_settings (" +
    "product_id TEXT PRIMARY KEY REFERENCES iiko_products(id) ON DELETE CASCADE," +
    "operation_name TEXT," +
    "batch_volume REAL," +
    "batch_unit TEXT," +
    "batch_time_minutes INTEGER," +
    "yield_amount REAL," +
    "yield_unit TEXT," +
    "labor_minutes REAL," +
    "hourly_rate REAL," +
    "recipe_effective_from TEXT," +
    "note TEXT," +
    "updated_at TEXT NOT NULL" +
  ")");
  addColumn(db, "product_production_settings", "hourly_rate", "REAL");
  addColumn(db, "product_production_settings", "recipe_effective_from", "TEXT");

  db.exec("CREATE TABLE IF NOT EXISTS local_recipe_items (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "dish_product_id TEXT NOT NULL REFERENCES iiko_products(id) ON DELETE CASCADE," +
    "ingredient_product_id TEXT NOT NULL REFERENCES iiko_products(id) ON DELETE RESTRICT," +
    "gross_quantity REAL," +
    "net_quantity REAL," +
    "unit TEXT," +
    "sort_order INTEGER NOT NULL DEFAULT 0," +
    "created_at TEXT NOT NULL" +
  ")");
  addColumn(db, "local_recipe_items", "net_quantity", "REAL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_local_recipe_items_dish ON local_recipe_items(dish_product_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_local_recipe_items_ingredient ON local_recipe_items(ingredient_product_id)");

  db.exec("CREATE TABLE IF NOT EXISTS iiko_sales (" +
    "id TEXT PRIMARY KEY," +
    "sale_date TEXT," +
    "dish_name TEXT NOT NULL," +
    "product_id TEXT," +
    "category TEXT," +
    "department TEXT," +
    "amount REAL NOT NULL DEFAULT 0," +
    "revenue REAL NOT NULL DEFAULT 0," +
    "raw_json TEXT NOT NULL," +
    "synced_at TEXT NOT NULL" +
  ")");
  addColumn(db, "iiko_sales", "concept", "TEXT");
  addColumn(db, "iiko_sales", "code", "TEXT");
  addColumn(db, "iiko_sales", "group_name", "TEXT");
  addColumn(db, "iiko_sales", "avg_price", "REAL");
  addColumn(db, "iiko_sales", "avg_price_no_discount", "REAL");
  addColumn(db, "iiko_sales", "revenue_no_discount", "REAL");
  addColumn(db, "iiko_sales", "gross_profit", "REAL");
  addColumn(db, "iiko_sales", "markup_percent", "REAL");
  addColumn(db, "iiko_sales", "discount_sum", "REAL");
  addColumn(db, "iiko_sales", "cost_per_unit", "REAL");
  addColumn(db, "iiko_sales", "cost_total", "REAL");
  addColumn(db, "iiko_sales", "cost_percent", "REAL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_sales_date ON iiko_sales(sale_date)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_iiko_sales_dish ON iiko_sales(dish_name)");

  db.exec("CREATE TABLE IF NOT EXISTS production_place_workshops (" +
    "production_place TEXT PRIMARY KEY," +
    "workshop TEXT NOT NULL DEFAULT ''," +
    "position TEXT," +
    "updated_at TEXT NOT NULL" +
  ")");

  db.exec("CREATE TABLE IF NOT EXISTS workshops (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "name TEXT NOT NULL UNIQUE," +
    "updated_at TEXT NOT NULL" +
  ")");
}

function seedWorkshopDefinitions(db: DatabaseSync) {
  const now = new Date().toISOString();
  const rows = db.prepare("SELECT DISTINCT workshop FROM production_place_workshops WHERE workshop <> ''").all() as { workshop: string }[];
  const insert = db.prepare("INSERT OR IGNORE INTO workshops (name, updated_at) VALUES (?, ?)");
  for (const row of rows) {
    const name = row.workshop.trim();
    if (name) insert.run(name, now);
  }
}

function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const rows = db.prepare("PRAGMA table_info(" + table + ")").all() as { name: string }[];
  if (!rows.some((row) => row.name === column)) {
    db.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
  }
}

type LocalProductRow = {
  id: string;
  name: string;
  kind: Product["kind"];
  type: string | null;
  article: string | null;
  code: string | null;
  measure_unit: string | null;
  category: string | null;
  group_name: string | null;
  category_id: string | null;
  category_name: string | null;
  group_id: string | null;
  group_display_name: string | null;
  price: number | null;
  raw_json: string;
  is_local: number | null;
  is_archived: number | null;
  operation_name: string | null;
  batch_volume: number | null;
  batch_unit: string | null;
  batch_time_minutes: number | null;
  yield_amount: number | null;
  yield_unit: string | null;
  labor_minutes: number | null;
  hourly_rate: number | null;
  recipe_effective_from: string | null;
  note: string | null;
};

type LastSyncRow = {
  id: number;
  finished_at: string;
  source: string;
  total_products: number;
  total_recipes: number;
};

type CountRow = { count: number };
type ReferenceRow = { id: string; name: string };
type IikoRecipeRow = { id: string; product_id: string | null; name: string | null; raw_json: string };
type LocalSalesDbRow = {
  id: string;
  sale_date: string | null;
  dish_name: string;
  product_id: string | null;
  category: string | null;
  department: string | null;
  amount: number;
  revenue: number;
  concept: string | null;
  code: string | null;
  group_name: string | null;
  avg_price: number | null;
  avg_price_no_discount: number | null;
  revenue_no_discount: number | null;
  gross_profit: number | null;
  markup_percent: number | null;
  discount_sum: number | null;
  cost_per_unit: number | null;
  cost_total: number | null;
  cost_percent: number | null;
  synced_at: string;
};
type WorkshopMappingRow = {
  production_place: string;
  workshop: string;
  position: string | null;
  updated_at: string;
};

type WorkshopDefinitionRow = {
  id: number;
  name: string;
  updated_at: string;
};
type LocalRecipeItemRow = {
  ingredient_product_id: string;
  ingredient_name: string;
  ingredient_article: string | null;
  ingredient_unit: string | null;
  gross_quantity: number | null;
  net_quantity: number | null;
  unit: string | null;
};

function readRecipeForProduct(db: DatabaseSync, row: LocalProductRow, referenceMap: Map<string, string>): Product["recipe"] | undefined {
  const localRows = db
    .prepare(
      "SELECT local_recipe_items.ingredient_product_id, iiko_products.name AS ingredient_name, iiko_products.article AS ingredient_article, " +
        "iiko_products.measure_unit AS ingredient_unit, local_recipe_items.gross_quantity, local_recipe_items.net_quantity, local_recipe_items.unit " +
        "FROM local_recipe_items " +
        "JOIN iiko_products ON iiko_products.id = local_recipe_items.ingredient_product_id " +
        "WHERE local_recipe_items.dish_product_id = ? " +
        "ORDER BY local_recipe_items.sort_order, local_recipe_items.id",
    )
    .all(row.id) as LocalRecipeItemRow[];

  if (localRows.length > 0) {
    return {
      source: "local",
      items: localRows.map((item) => ({
        ingredientId: item.ingredient_product_id,
        name: item.ingredient_name,
        article: item.ingredient_article ?? undefined,
        unit: item.unit ?? readMeasureUnitFromRaw(JSON.stringify({ mainUnit: item.ingredient_unit })) ?? resolveReferenceName(referenceMap, item.ingredient_unit ?? undefined) ?? defaultMeasureUnitName(item.ingredient_unit),
        grossQuantity: item.gross_quantity,
        netQuantity: item.net_quantity,
      })),
    };
  }

  const rows = db
    .prepare(
      "SELECT id, product_id, name, raw_json FROM iiko_recipes " +
        "WHERE product_id = ? OR raw_json LIKE ? OR raw_json LIKE ? " +
        "ORDER BY synced_at DESC LIMIT 12",
    )
    .all(row.id, like(row.id), row.article ? like(row.article) : "__no_article__") as IikoRecipeRow[];

  if (rows.length === 0) return undefined;

  const items: RecipeIngredient[] = [];
  for (const recipeRow of rows) {
    try {
      items.push(...collectRecipeIngredients(JSON.parse(recipeRow.raw_json), referenceMap));
    } catch {
      // Keep rawCount below so the user can see that a recipe exists even if its shape is unknown.
    }
  }

  return { source: "iiko", items: dedupeRecipeIngredients(items), rawCount: rows.length };
}

function rowToProduct(row: LocalProductRow, referenceMap: Map<string, string>): Product {
  const categoryId = row.category_id ?? fallbackId(row.category);
  const groupId = row.group_id ?? fallbackId(row.group_name);

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    type: row.type ?? undefined,
    article: row.article ?? readArticleFromRaw(row.raw_json),
    code: row.code ?? undefined,
    measureUnit: readMeasureUnitFromRaw(row.raw_json) ?? resolveReferenceName(referenceMap, row.measure_unit ?? undefined) ?? defaultMeasureUnitName(row.measure_unit) ?? fallbackName(row.measure_unit),
    categoryId,
    category: row.category_name ?? resolveReferenceName(referenceMap, categoryId) ?? fallbackName(row.category),
    groupId,
    group: row.group_display_name ?? resolveReferenceName(referenceMap, groupId) ?? fallbackName(row.group_name),
    productionPlace: readTextFromRaw(row.raw_json, "\u0422\u0438\u043f \u043c\u0435\u0441\u0442\u0430 \u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u044f") ?? "\u041d\u0435\u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u043d\u044b\u0435",
    price: row.price ?? undefined,
    isLocal: Boolean(row.is_local),
    isArchived: Boolean(row.is_archived),
    production: {
      operationName: row.operation_name ?? undefined,
      batchVolume: row.batch_volume,
      batchUnit: row.batch_unit ?? undefined,
      batchTimeMinutes: row.batch_time_minutes,
      yieldAmount: row.yield_amount,
      yieldUnit: row.yield_unit ?? undefined,
      laborMinutes: row.labor_minutes,
      hourlyRate: row.hourly_rate,
      recipeEffectiveFrom: row.recipe_effective_from ?? undefined,
      note: row.note ?? undefined,
    },
  };
}

function collectRecipeIngredients(value: unknown, referenceMap: Map<string, string>) {
  const items: RecipeIngredient[] = [];
  walkJson(value, (candidate) => {
    const ingredientId =
      readText(candidate.ingredientId) ??
      readText(candidate.productId) ??
      readText(candidate.goodId) ??
      readReferenceId(candidate.ingredient) ??
      readReferenceId(candidate.product) ??
      readReferenceId(candidate.good) ??
      readReferenceId(candidate.item);
    const name =
      readText(candidate.ingredientName) ??
      readText(candidate.productName) ??
      readText(candidate.goodName) ??
      readReferenceName(candidate.ingredient) ??
      readReferenceName(candidate.product) ??
      readReferenceName(candidate.good) ??
      readReferenceName(candidate.item) ??
      (ingredientId ? resolveReferenceName(referenceMap, ingredientId) : undefined) ??
      readText(candidate.name);
    const grossQuantity =
      readJsonNumber(candidate.grossQuantity) ??
      readJsonNumber(candidate.gross) ??
      readJsonNumber(candidate.grossWeight) ??
      readJsonNumber(candidate.brutto) ??
      readJsonNumber(candidate.amountIn) ??
      readJsonNumber(candidate.amount) ??
      readJsonNumber(candidate.quantity);
    const netQuantity =
      readJsonNumber(candidate.netQuantity) ??
      readJsonNumber(candidate.net) ??
      readJsonNumber(candidate.netto) ??
      readJsonNumber(candidate.netWeight) ??
      readJsonNumber(candidate.amountOut);
    const unit =
      readReferenceName(candidate.unit) ??
      readReferenceName(candidate.measureUnit) ??
      readReferenceName(candidate.mainUnit) ??
      readText(candidate.unit) ??
      readText(candidate.measureUnit) ??
      readText(candidate.mainUnit);
    const article = readText(candidate.article) ?? readText(candidate.num) ?? readText(candidate.sku);
    const hasQuantitySignal = grossQuantity !== undefined || netQuantity !== undefined || Object.keys(candidate).some((key) => /gross|brutto|netto|net|amount|quantity/i.test(key));

    if (!name || !hasQuantitySignal) return;
    items.push({
      ingredientId,
      name,
      article,
      unit: unit ? resolveReferenceName(referenceMap, unit) ?? defaultMeasureUnitName(unit) ?? unit : undefined,
      grossQuantity: grossQuantity ?? null,
      netQuantity: netQuantity ?? null,
    });
  });
  return dedupeRecipeIngredients(items);
}

function dedupeRecipeIngredients(items: RecipeIngredient[]) {
  const seen = new Set<string>();
  const result: RecipeIngredient[] = [];
  for (const item of items) {
    const key = [item.ingredientId, item.name, item.article, item.grossQuantity, item.netQuantity, item.unit].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function walkJson(value: unknown, visit: (value: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  const objectValue = value as Record<string, unknown>;
  visit(objectValue);
  for (const child of Object.values(objectValue)) walkJson(child, visit);
}

function readReferenceId(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || undefined;
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readText(objectValue.id) ?? readText(objectValue.eid) ?? readText(objectValue.value);
  }
  return undefined;
}

function readReferenceName(value: unknown) {
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readText(objectValue.name) ?? readText(objectValue.title) ?? readText(objectValue.defaultValue);
  }
  return undefined;
}

function readJsonNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) ? number : undefined;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readJsonNumber(objectValue.value) ?? readJsonNumber(objectValue.amount) ?? readJsonNumber(objectValue.quantity);
  }
  return undefined;
}

function like(value: string) {
  return "%" + value.replace(/[\%_]/g, "") + "%";
}


function fallbackId(value: string | null) {
  return value && looksLikeId(value) ? value : undefined;
}

function fallbackName(value: string | null) {
  return value && !looksLikeId(value) ? value : undefined;
}

function looksLikeId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
}

function defaultMeasureUnitName(id: string | null) {
  if (!id) return undefined;
  const units: Record<string, string> = {
    "6040d92d-e286-f4f9-a613-ed0e6fd241e1": "РїРѕСЂС†.",
    "cd19b5ea-1b32-a6e5-1df7-5d2784a0549a": "С€С‚",
    "7ba81c3a-8de5-8f9d-fb9f-e39efcbc57cc": "РєРі",
    "69859c74-db72-b006-cba5-326cf6f4fc6e": "Р»",
    "d7a3f7e1-c2c6-43cf-9165-f5dbe474737a": "СѓРїР°Рє.",
    "47656814-4932-4f15-bdee-2cb69d7ba31a": "Рј",
    "15583df7-33b7-4f32-966a-e7385216ab4b": "РїР°СЂР°",
    "519d7fa6-0776-45cc-9552-52ce4551da5e": "Рі",
  };
  return units[id];
}

function readMeasureUnitFromRaw(rawJson: string) {
  try {
    const value = JSON.parse(rawJson) as { measureUnit?: unknown; unit?: unknown; mainUnit?: unknown };
    return readNamedValue(value.measureUnit) ?? readNamedValue(value.unit) ?? readNamedValue(value.mainUnit);
  } catch {
    return undefined;
  }
}

function readNamedValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return undefined;
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readText(objectValue.name) ?? readText(objectValue.title) ?? readText(objectValue.defaultValue);
  }
  return undefined;
}


function emptyToNull(value: string | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSaleDate(value: string | undefined) {
  const text = value?.trim();
  if (!text) return undefined;
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  const ruDate = text.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruDate) return `${ruDate[3]}-${ruDate[2]}-${ruDate[1]}`;
  return text.slice(0, 10);
}

function parseSalesRaw(rawJson: string) {
  try {
    return JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readRawText(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || undefined;
  }
  return undefined;
}

function readRawNumber(raw: Record<string, unknown>, key: string) {
  const value = raw[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}


function readTextFromRaw(rawJson: string, key: string) {
  try {
    const value = JSON.parse(rawJson) as Record<string, unknown>;
    return readText(value[key]);
  } catch {
    return undefined;
  }
}

function writeTextToRaw(rawJson: string, key: string, value: string | null) {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    raw = {};
  }
  if (value) raw[key] = value;
  else delete raw[key];
  return JSON.stringify(raw);
}

function readArticleFromRaw(rawJson: string) {
  try {
    const value = JSON.parse(rawJson) as { article?: unknown; sku?: unknown; num?: unknown };
    return readText(value.article) ?? readText(value.sku) ?? readText(value.num);
  } catch {
    return undefined;
  }
}

function readText(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || undefined;
  }
  return undefined;
}
