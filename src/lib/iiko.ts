import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

const productListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string().optional(),
      code: z.string().optional(),
      measureUnit: z.string().optional(),
    }),
  ),
  totalFound: z.number(),
  filtered: z.boolean(),
});

export type ProductList = z.infer<typeof productListSchema>;

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
  return url.replace(/\/+$/, "");
}

export function hashPassword(password: string) {
  return crypto.createHash("sha1").update(password, "utf8").digest("hex");
}

export async function loginToIiko(params: {
  baseUrl: string;
  login: string;
  password: string;
}) {
  const authUrl = new URL(`${normalizeBaseUrl(params.baseUrl)}/api/auth`);
  authUrl.searchParams.set("login", params.login);
  authUrl.searchParams.set("pass", hashPassword(params.password));

  const response = await fetch(authUrl, {
    method: "GET",
    cache: "no-store",
  });

  const text = (await response.text()).trim();

  if (!response.ok) {
    throw new IikoError(
      response.status === 401
        ? "iiko не принял логин или пароль."
        : `iiko вернул ошибку авторизации: ${response.status}`,
      response.status,
    );
  }

  const token = text.replace(/^"|"$/g, "");
  if (!token) {
    throw new IikoError("iiko не вернул токен сессии.");
  }

  return token;
}

export async function logoutFromIiko(baseUrl: string, token: string) {
  const logoutUrl = new URL(`${normalizeBaseUrl(baseUrl)}/api/logout`);
  logoutUrl.searchParams.set("key", token);

  await fetch(logoutUrl, {
    method: "GET",
    cache: "no-store",
  }).catch(() => undefined);
}

export async function fetchSemiFinishedProducts(baseUrl: string, token: string) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/api/v2/entities/products/list`);
  url.searchParams.set("key", token);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json, text/xml, application/xml, */*",
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new IikoError(
      response.status === 401
        ? "Сессия iiko недоступна или истекла. Войдите заново."
        : `iiko вернул ошибку при загрузке номенклатуры: ${response.status}`,
      response.status,
    );
  }

  const parsed = parseIikoBody(body, response.headers.get("content-type"));
  const products = collectProducts(parsed);
  const semiFinished = products.filter(isSemiFinished);
  const items = semiFinished.length > 0 ? semiFinished : products.slice(0, 50);

  return productListSchema.parse({
    items,
    totalFound: products.length,
    filtered: semiFinished.length > 0,
  });
}

function parseIikoBody(body: string, contentType: string | null): unknown {
  const trimmed = body.trim();
  if (!trimmed) {
    return {};
  }

  if (contentType?.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  return xmlParser.parse(trimmed);
}

function collectProducts(value: unknown): ProductList["items"] {
  const products: ProductList["items"] = [];
  const seen = new Set<string>();

  walk(value, (candidate) => {
    const normalized = normalizeProduct(candidate);
    if (!normalized) {
      return;
    }

    const key = normalized.id || `${normalized.name}:${normalized.code ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      products.push(normalized);
    }
  });

  return products;
}

function walk(value: unknown, visit: (value: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visit);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const objectValue = value as Record<string, unknown>;
  visit(objectValue);

  for (const child of Object.values(objectValue)) {
    walk(child, visit);
  }
}

function normalizeProduct(value: Record<string, unknown>) {
  const name = readString(value.name);
  const id = readString(value.id) ?? readString(value.eid);

  if (!name || !id) {
    return null;
  }

  const type =
    readString(value.type) ??
    readString(value.productType) ??
    readString(value.accountingCategory) ??
    readString(value.category);

  return {
    id,
    name,
    type,
    code: readString(value.code) ?? readString(value.num),
    measureUnit:
      readString(value.measureUnit) ??
      readString(value.unit) ??
      readString(value.mainUnit),
  };
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return (
      readString(objectValue.value) ??
      readString(objectValue.customValue) ??
      readString(objectValue.defaultValue) ??
      readString(objectValue.name)
    );
  }

  return undefined;
}

function isSemiFinished(product: ProductList["items"][number]) {
  const haystack = `${product.name} ${product.type ?? ""}`.toLowerCase();
  return (
    haystack.includes("semi") ||
    haystack.includes("prepared") ||
    haystack.includes("полуфаб") ||
    haystack.includes("п/ф") ||
    haystack.includes("заготов")
  );
}
