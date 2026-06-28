import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const productKindSchema = z.enum(["semifinished", "dish", "other"]);

const categoryCountSchema = z.object({
  id: z.string().optional(),
  category: z.string(),
  count: z.number(),
  dishes: z.number(),
  semifinished: z.number(),
  goods: z.number(),
});

const productionSettingsSchema = z.object({
  operationName: z.string().optional(),
  batchVolume: z.number().nullable().optional(),
  batchUnit: z.string().optional(),
  batchTimeMinutes: z.number().nullable().optional(),
  yieldAmount: z.number().nullable().optional(),
  yieldUnit: z.string().optional(),
  laborMinutes: z.number().nullable().optional(),
  hourlyRate: z.number().nullable().optional(),
  note: z.string().optional(),
});

const recipeIngredientSchema = z.object({
  ingredientId: z.string().optional(),
  name: z.string(),
  article: z.string().optional(),
  unit: z.string().optional(),
  grossQuantity: z.number().nullable().optional(),
  netQuantity: z.number().nullable().optional(),
});

const productRecipeSchema = z.object({
  source: z.enum(["local", "iiko"]),
  items: z.array(recipeIngredientSchema),
  rawCount: z.number().optional(),
});

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: productKindSchema,
  type: z.string().optional(),
  article: z.string().optional(),
  code: z.string().optional(),
  measureUnit: z.string().optional(),
  categoryId: z.string().optional(),
  category: z.string().optional(),
  groupId: z.string().optional(),
  group: z.string().optional(),
  productionPlace: z.string().optional(),
  price: z.number().optional(),
  isLocal: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  production: productionSettingsSchema.optional(),
  recipe: productRecipeSchema.optional(),
  rawJson: z.string().optional(),
});

const productListSchema = z.object({
  items: z.array(productSchema),
  totalFound: z.number(),
  filtered: z.boolean(),
  summary: z.object({
    semifinished: z.object({ total: z.number(), byCategory: z.array(categoryCountSchema) }),
    dishes: z.object({ total: z.number(), byCategory: z.array(categoryCountSchema) }),
    goods: z.object({ total: z.number(), byCategory: z.array(categoryCountSchema) }),
    allCategories: z.array(categoryCountSchema),
  }),
});

export type ProductList = z.infer<typeof productListSchema>;
export type Product = ProductList["items"][number];
export type ProductSummary = ProductList["summary"];
export type ProductionSettings = NonNullable<Product["production"]>;
export type ProductRecipe = NonNullable<Product["recipe"]>;
export type RecipeIngredient = ProductRecipe["items"][number];

export type IikoReference = {
  id: string;
  name: string;
  type: string;
  parentId?: string;
  rawJson: string;
};

export type IikoRawPayload = {
  endpoint: string;
  status: number;
  rawJson: string;
};

export type IikoRecipe = {
  id: string;
  productId?: string;
  name?: string;
  rawJson: string;
};

export type IikoSyncData = {
  products: Product[];
  references: IikoReference[];
  recipes: IikoRecipe[];
  rawPayloads: IikoRawPayload[];
};

export type IikoSale = {
  id: string;
  date?: string;
  dishName: string;
  productId?: string;
  category?: string;
  department?: string;
  amount: number;
  revenue: number;
  rawJson: string;
};

const referenceEndpoints = [
  "/api/v2/entities/products/group/list",
  "/api/v2/entities/productGroups/list",
  "/api/v2/entities/groups/list",
  "/api/v2/entities/products/categories/list",
  "/api/v2/entities/productCategories/list",
  "/api/v2/entities/accountingCategories/list",
  "/api/v2/entities/products/accountingCategories/list",
  "/api/v2/entities/measureUnits/list",
  "/api/v2/entities/measurementUnits/list",
  "/api/v2/entities/units/list",
];

const recipeEndpoints = [
  "/api/v2/entities/products/assemblyCharts/list",
  "/api/v2/entities/assemblyCharts/list",
  "/api/v2/entities/products/assemblyChart/list",
  "/api/v2/entities/assemblyChart/list",
  "/api/v2/entities/products/technologicalCards/list",
  "/api/v2/entities/technologicalCards/list",
  "/api/v2/entities/recipes/list",
  "/api/v2/assemblyCharts/list",
  "/api/assemblyCharts/list",
  "/api/products/assemblyCharts/list",
  "/api/v2/entities/products/assemblyCharts",
];

const perProductRecipeEndpoints = [
  "/api/v2/entities/products/assemblyCharts/list",
  "/api/v2/entities/assemblyCharts/list",
  "/api/v2/entities/products/assemblyChart",
  "/api/v2/entities/assemblyChart",
  "/api/v2/entities/products/technologicalCards/list",
  "/api/v2/entities/technologicalCards/list",
  "/api/v2/entities/recipes/list",
  "/api/v2/entities/products/recipes/list",
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "value",
});

export class IikoError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

export function normalizeBaseUrl(url: string) {
  const trimmed = url.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
  const parsed = new URL(withProtocol);
  const cleanPath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = cleanPath && cleanPath !== "/" ? cleanPath : "/resto";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

export function hashPassword(password: string) {
  return crypto.createHash("sha1").update(password, "utf8").digest("hex");
}

export async function loginToIiko(params: { baseUrl: string; login: string; password: string }) {
  const authUrl = new URL(normalizeBaseUrl(params.baseUrl) + "/api/auth");
  authUrl.searchParams.set("login", params.login);
  authUrl.searchParams.set("pass", hashPassword(params.password));

  const response = await fetch(authUrl, { method: "GET", cache: "no-store" });
  const text = (await response.text()).trim();

  if (!response.ok) {
    throw new IikoError(
      response.status === 401 ? "iiko не принял логин или пароль." : "iiko вернул ошибку авторизации: " + response.status,
      response.status,
    );
  }

  const token = text.replace(/^"|"$/g, "");
  if (!token) throw new IikoError("iiko не вернул токен сессии.");
  return token;
}

export async function logoutFromIiko(baseUrl: string, token: string) {
  const logoutUrl = new URL(normalizeBaseUrl(baseUrl) + "/api/logout");
  logoutUrl.searchParams.set("key", token);
  await fetch(logoutUrl, { method: "GET", cache: "no-store" }).catch(() => undefined);
}

export async function fetchSemiFinishedProducts(baseUrl: string, token: string) {
  const products = await fetchIikoProducts(baseUrl, token);
  const importantItems = products.filter((product) => product.kind !== "other");
  return productListSchema.parse({
    items: importantItems.length > 0 ? importantItems : products.slice(0, 50),
    totalFound: products.length,
    filtered: importantItems.length > 0,
    summary: buildProductSummary(products),
  });
}

export async function fetchFullIikoSnapshot(baseUrl: string, token: string): Promise<IikoSyncData> {
  const productsPayload = await fetchIikoPayload(baseUrl, token, "/api/v2/entities/products/list", true);
  const products = collectProducts(productsPayload.parsed);
  const rawPayloads: IikoRawPayload[] = [toRawPayload(productsPayload)];
  const references: IikoReference[] = [];
  const recipes: IikoRecipe[] = [];

  for (const endpoint of referenceEndpoints) {
    const payload = await fetchIikoPayload(baseUrl, token, endpoint, false);
    if (!payload) continue;
    rawPayloads.push(toRawPayload(payload));
    if (payload.ok) references.push(...collectReferences(payload.parsed, endpoint));
  }

  for (const endpoint of recipeEndpoints) {
    const payload = await fetchIikoPayload(baseUrl, token, endpoint, false);
    if (!payload) continue;
    rawPayloads.push(toRawPayload(payload));
    if (payload.ok) recipes.push(...collectRecipes(payload.parsed));
  }

  if (recipes.length === 0) {
    const recipeProducts = products.filter((product) => product.kind === "dish" || product.kind === "semifinished");
    for (const product of recipeProducts) {
      const recipe = await fetchRecipeForProduct(baseUrl, token, product);
      rawPayloads.push(...recipe.rawPayloads);
      recipes.push(...recipe.recipes);
    }
  }

  references.push(...collectReferences(productsPayload.parsed, "products/list"));

  return {
    products,
    references: dedupeById(references),
    recipes: dedupeById(recipes),
    rawPayloads,
  };
}

export async function fetchIikoProducts(baseUrl: string, token: string) {
  const payload = await fetchIikoPayload(baseUrl, token, "/api/v2/entities/products/list", true);
  return collectProducts(payload.parsed);
}

export async function fetchIikoSalesReport(params: { baseUrl: string; token: string; dateFrom: string; dateTo: string }) {
  const from = formatIikoDateTime(params.dateFrom, false);
  const to = formatIikoDateTime(params.dateTo, true);
  const attempts: Array<Array<[string, string]>> = [
    [
      ["report", "SALES"],
      ["from", from],
      ["to", to],
      ["groupRow", "OpenDate.Typed"],
      ["groupRow", "Department"],
      ["groupRow", "DishName"],
      ["agr", "DishAmount"],
      ["agr", "DishDiscountSumInt"],
    ],
    [
      ["report", "SALES"],
      ["from", from],
      ["to", to],
      ["groupRow", "OpenDate.Typed"],
      ["groupRow", "DishName"],
      ["agr", "DishAmount"],
      ["agr", "DishDiscountSumInt"],
    ],
    [
      ["report", "SALES"],
      ["dateFrom", from],
      ["dateTo", to],
      ["groupRow", "OpenDate.Typed"],
      ["groupRow", "Department"],
      ["groupRow", "DishName"],
      ["agr", "DishAmount"],
      ["agr", "DishDiscountSumInt"],
    ],
  ];
  const endpoints = ["/api/reports/olap", "/api/v2/reports/olap"];
  const errors: string[] = [];
  let firstOk: { endpoint: string; status: number; parsed: unknown; rows: IikoSale[] } | undefined;

  for (const endpoint of endpoints) {
    for (const query of attempts) {
      const payload = await fetchIikoSalesPayload(params.baseUrl, params.token, endpoint, query);
      if (!payload.ok) {
        errors.push(payload.endpoint + ": " + payload.status);
        continue;
      }
      const rows = collectSalesRows(payload.parsed);
      firstOk ??= { endpoint: payload.endpoint, status: payload.status, parsed: payload.parsed, rows };
      if (rows.length > 0) return { rows, rawPayload: toRawPayload(payload), endpoint: payload.endpoint };
    }
  }

  if (firstOk) {
    return { rows: firstOk.rows, rawPayload: { endpoint: firstOk.endpoint, status: firstOk.status, rawJson: JSON.stringify(firstOk.parsed) }, endpoint: firstOk.endpoint };
  }

  throw new IikoError("iiko не вернул отчет продаж. Проверенные варианты: " + errors.join(", "), 502);
}

async function fetchRecipeForProduct(baseUrl: string, token: string, product: Product) {
  const rawPayloads: IikoRawPayload[] = [];
  const recipes: IikoRecipe[] = [];

  for (const endpoint of perProductRecipeEndpoints) {
    for (const paramName of ["productId", "product", "id", "num", "article"]) {
      const lookupValue = paramName === "num" || paramName === "article" ? product.article : product.id;
      if (!lookupValue) continue;
      const payload = await fetchIikoPayload(baseUrl, token, endpoint, false, { [paramName]: lookupValue });
      if (!payload) continue;
      if (!payload.ok) continue;
      rawPayloads.push(toRawPayload(payload));

      const found = collectRecipes(payload.parsed).map((recipe) => ({
        ...recipe,
        productId: recipe.productId ?? product.id,
        name: recipe.name ?? product.name,
      }));
      recipes.push(...found);
      if (found.length > 0) return { rawPayloads, recipes };
    }
  }

  return { rawPayloads, recipes };
}

type PayloadResult = {
  endpoint: string;
  status: number;
  ok: boolean;
  parsed: unknown;
};

async function fetchIikoPayload(
  baseUrl: string,
  token: string,
  endpoint: string,
  required: true,
  params?: Record<string, string>,
): Promise<PayloadResult>;
async function fetchIikoPayload(
  baseUrl: string,
  token: string,
  endpoint: string,
  required: false,
  params?: Record<string, string>,
): Promise<PayloadResult | null>;
async function fetchIikoPayload(baseUrl: string, token: string, endpoint: string, required: boolean, params: Record<string, string> = {}) {
  const url = new URL(normalizeBaseUrl(baseUrl) + endpoint);
  url.searchParams.set("key", token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json, text/xml, application/xml, */*" },
  });
  const body = await response.text();
  const parsed = parseIikoBodySafely(body, response.headers.get("content-type"));
  const endpointWithParams = endpoint + formatParamsForLog(params);

  if (!response.ok) {
    if (!required) return { endpoint: endpointWithParams, status: response.status, ok: false, parsed };
    throw new IikoError(
      response.status === 401
        ? "Сессия iiko недоступна или истекла. Войдите заново."
        : "iiko вернул ошибку при загрузке " + endpoint + ": " + response.status,
      response.status,
    );
  }

  return { endpoint: endpointWithParams, status: response.status, ok: true, parsed };
}

async function fetchIikoSalesPayload(baseUrl: string, token: string, endpoint: string, params: Array<[string, string]>) {
  const url = new URL(normalizeBaseUrl(baseUrl) + endpoint);
  url.searchParams.set("key", token);
  for (const [key, value] of params) url.searchParams.append(key, value);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json, text/xml, application/xml, */*" },
  });
  const body = await response.text();
  const parsed = parseIikoBodySafely(body, response.headers.get("content-type"));
  return { endpoint: endpoint + "?" + params.map(([key, value]) => key + "=" + value).join("&"), status: response.status, ok: response.ok, parsed };
}

function toRawPayload(payload: PayloadResult): IikoRawPayload {
  return { endpoint: payload.endpoint, status: payload.status, rawJson: JSON.stringify(payload.parsed) };
}

function parseIikoBodySafely(body: string, contentType: string | null): unknown {
  try {
    return parseIikoBody(body, contentType);
  } catch {
    return { rawText: body.slice(0, 4000) };
  }
}

function parseIikoBody(body: string, contentType: string | null): unknown {
  const trimmed = body.trim();
  if (!trimmed) return {};
  if (contentType?.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  return xmlParser.parse(trimmed);
}

function collectProducts(value: unknown): Product[] {
  const products: Product[] = [];
  const seen = new Set<string>();
  walk(value, (candidate) => {
    const normalized = normalizeProduct(candidate);
    if (!normalized) return;
    const key = normalized.id || normalized.name + ":" + (normalized.code ?? "");
    if (!seen.has(key)) {
      seen.add(key);
      products.push(normalized);
    }
  });
  return products;
}

function collectReferences(value: unknown, type: string): IikoReference[] {
  const references: IikoReference[] = [];
  walk(value, (candidate) => {
    const id = readString(candidate.id) ?? readString(candidate.eid);
    const name = readString(candidate.name) ?? readString(candidate.title);
    if (!id || !name) return;
    references.push({
      id,
      name,
      type,
      parentId: readString(candidate.parent) ?? readString(candidate.parentId) ?? readString(candidate.group),
      rawJson: JSON.stringify(candidate),
    });
  });
  return references;
}

function collectRecipes(value: unknown): IikoRecipe[] {
  const recipes: IikoRecipe[] = [];
  walk(value, (candidate) => {
    const id = readString(candidate.id) ?? readString(candidate.eid) ?? readString(candidate.assemblyChartId) ?? readString(candidate.recipeId) ?? readString(candidate.techCardId);
    const productId =
      readString(candidate.productId) ??
      readString(candidate.dishId) ??
      readString(candidate.goodId) ??
      readString(candidate.itemId) ??
      readReferenceId(candidate.product) ??
      readReferenceId(candidate.dish) ??
      readReferenceId(candidate.good) ??
      readReferenceId(candidate.item);
    const name =
      readString(candidate.name) ??
      readString(candidate.productName) ??
      readString(candidate.dishName) ??
      readReferenceName(candidate.product) ??
      readReferenceName(candidate.dish) ??
      readReferenceName(candidate.good);
    const raw = JSON.stringify(candidate);
    const looksLikeRecipe = hasRecipeKey(candidate) || /ingredient|component|technology|assembly|recipe|netto|gross|brutto/i.test(raw);
    if (!looksLikeRecipe) return;
    const stableId = id ?? productId ?? name ?? crypto.createHash("sha1").update(raw).digest("hex");
    recipes.push({ id: stableId, productId, name, rawJson: raw });
  });
  return recipes;
}

function collectSalesRows(value: unknown): IikoSale[] {
  const rows: IikoSale[] = [];
  walk(value, (candidate) => {
    const dishName =
      readStringByKeys(candidate, ["DishName", "dishName", "dish", "Dish", "ProductName", "productName", "name"]) ??
      readStringByPattern(candidate, /dish.*name|product.*name|блюд/i);
    const amount =
      readNumberByKeys(candidate, ["DishAmount", "dishAmount", "amount", "quantity", "qty"]) ??
      readNumberByPattern(candidate, /dish.*amount|amount|quantity|кол/i);
    const revenue =
      readNumberByKeys(candidate, ["DishDiscountSumInt", "dishDiscountSumInt", "DishSumInt", "dishSumInt", "revenue", "sum"]) ??
      readNumberByPattern(candidate, /discount.*sum|dish.*sum|revenue|sum|выруч/i);
    if (!dishName || amount === undefined || revenue === undefined) return;

    const rawJson = JSON.stringify(candidate);
    rows.push({
      id: crypto.createHash("sha1").update(rawJson + rows.length).digest("hex"),
      date:
        readStringByKeys(candidate, ["OpenDate.Typed", "openDate", "date", "Date", "closeTime", "CloseTime"]) ??
        readStringByPattern(candidate, /open.*date|date|time|дата/i),
      dishName,
      productId: readStringByKeys(candidate, ["DishId", "dishId", "ProductId", "productId", "id"]),
      category: readStringByKeys(candidate, ["DishGroup", "dishGroup", "Category", "category", "ProductCategory", "productCategory"]),
      department:
        readStringByKeys(candidate, ["Department", "department", "DepartmentName", "departmentName", "RestaurantSection", "restaurantSection"]) ??
        readStringByPattern(candidate, /department|section|подраздел|место/i),
      amount,
      revenue,
      rawJson,
    });
  });
  return dedupeSalesRows(rows);
}

function dedupeSalesRows(rows: IikoSale[]) {
  const seen = new Set<string>();
  const result: IikoSale[] = [];
  for (const row of rows) {
    const key = [row.date, row.department, row.category, row.dishName, row.amount, row.revenue].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function hasRecipeKey(value: Record<string, unknown>) {
  return Object.keys(value).some((key) => /assembly|recipe|ingredient|technology|component|item|netto|gross/i.test(key));
}

function walk(value: unknown, visit: (value: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  const objectValue = value as Record<string, unknown>;
  visit(objectValue);
  for (const child of Object.values(objectValue)) walk(child, visit);
}

function normalizeProduct(value: Record<string, unknown>): Product | null {
  const name = readString(value.name);
  const id = readString(value.id) ?? readString(value.eid);
  if (!name || !id) return null;

  const type = readString(value.type) ?? readString(value.productType) ?? readString(value.productCategory) ?? readString(value.accountingCategory);
  const categoryValue = readReference(value.category) ?? readReference(value.productCategory) ?? readReference(value.accountingCategory);
  const groupValue = readReference(value.group) ?? readReference(value.productGroup) ?? readReference(value.parent) ?? readReference(value.parentGroup) ?? readReference(value.department);
  const product = {
    id,
    name,
    kind: "other" as const,
    type,
    article: readString(value.article) ?? readString(value.sku) ?? readString(value.num),
    code: readString(value.code),
    measureUnit: readString(value.measureUnit) ?? readString(value.unit) ?? readString(value.mainUnit),
    categoryId: categoryValue?.id,
    category: categoryValue?.name,
    groupId: groupValue?.id,
    group: groupValue?.name,
    price: readNumber(value.price) ?? readNumber(value.salePrice) ?? readNumber(value.defaultSalePrice),
    rawJson: JSON.stringify(value),
  };
  return { ...product, kind: detectProductKind(product) };
}

function detectProductKind(product: Pick<Product, "name" | "type" | "category" | "group">): Product["kind"] {
  const haystack = [product.name, product.type, product.category, product.group].filter(Boolean).join(" ").toLowerCase();
  if (haystack.includes("semi") || haystack.includes("prepared") || haystack.includes("preparation") || haystack.includes("полуфаб") || haystack.includes("п/ф") || haystack.includes("заготов")) return "semifinished";
  if (haystack.includes("dish") || haystack.includes("meal") || haystack.includes("блюдо") || product.type?.toUpperCase() === "DISH") return "dish";
  return "other";
}

export function buildProductSummary(products: Product[]): ProductSummary {
  const semifinished = products.filter((product) => product.kind === "semifinished");
  const dishes = products.filter((product) => product.kind === "dish");
  const goods = products.filter((product) => product.kind === "other");
  return {
    semifinished: { total: semifinished.length, byCategory: countByCategory(semifinished) },
    dishes: { total: dishes.length, byCategory: countByCategory(dishes) },
    goods: { total: goods.length, byCategory: countByCategory(goods) },
    allCategories: countByCategory(products),
  };
}

function countByCategory(products: Product[]) {
  const counts = new Map<string, { id?: string; category: string; count: number; dishes: number; semifinished: number; goods: number }>();
  for (const product of products) {
    const id = product.groupId ?? product.categoryId;
    const category = product.group ?? product.category ?? shortId(id) ?? "Без категории";
    const key = id ?? category;
    const current = counts.get(key) ?? { id, category, count: 0, dishes: 0, semifinished: 0, goods: 0 };
    current.count += 1;
    if (product.kind === "dish") current.dishes += 1;
    else if (product.kind === "semifinished") current.semifinished += 1;
    else current.goods += 1;
    counts.set(key, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, "ru"));
}

function readReferenceId(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || undefined;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readString(objectValue.id) ?? readString(objectValue.eid) ?? readString(objectValue.value);
  }
  return undefined;
}

function readReferenceName(value: unknown) {
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readString(objectValue.name) ?? readString(objectValue.title) ?? readString(objectValue.defaultValue);
  }
  return undefined;
}

function readReference(value: unknown): { id?: string; name?: string } | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text ? { id: text } : undefined;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const id = readString(objectValue.id) ?? readString(objectValue.eid) ?? readString(objectValue.value);
    const name = readString(objectValue.name) ?? readString(objectValue.title) ?? readString(objectValue.defaultValue);
    return id || name ? { id, name } : undefined;
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readString(objectValue.value) ?? readString(objectValue.customValue) ?? readString(objectValue.defaultValue) ?? readString(objectValue.name) ?? readString(objectValue.title);
  }
  return undefined;
}

function readStringByKeys(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = readString(value[key]);
    if (direct) return direct;
    const foundKey = Object.keys(value).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (foundKey) {
      const found = readString(value[foundKey]);
      if (found) return found;
    }
  }
  return undefined;
}

function readStringByPattern(value: Record<string, unknown>, pattern: RegExp) {
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!pattern.test(key)) continue;
    const text = readString(fieldValue);
    if (text) return text;
  }
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) ? number : undefined;
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return readNumber(objectValue.value) ?? readNumber(objectValue.amount);
  }
  return undefined;
}

function readNumberByKeys(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = readNumber(value[key]);
    if (direct !== undefined) return direct;
    const foundKey = Object.keys(value).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (foundKey) {
      const found = readNumber(value[foundKey]);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function readNumberByPattern(value: Record<string, unknown>, pattern: RegExp) {
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!pattern.test(key)) continue;
    const number = readNumber(fieldValue);
    if (number !== undefined) return number;
  }
  return undefined;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return Array.from(seen.values());
}

function shortId(value?: string) {
  return value && value.length > 12 ? value.slice(0, 8) : value;
}

function formatIikoDateTime(value: string, endOfDay: boolean) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year} ${endOfDay ? "23:59:59" : "00:00:00"}`;
}

function formatParamsForLog(params: Record<string, string>) {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  return "?" + entries.map(([key, value]) => key + "=" + value).join("&");
}
