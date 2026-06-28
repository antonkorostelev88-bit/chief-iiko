"use client";

import { CSSProperties, FormEvent, Fragment, ReactNode, useEffect, useMemo, useState } from "react";

type ProductKind = "semifinished" | "dish" | "other";
type ActiveSheet = "goods" | "semifinished" | "dishes" | "workshops" | "calculator" | "costing" | "test" | "sales" | "sync";
type ProductColumnKey = "name" | "category" | "article" | "code" | "unit" | "price" | "batchVolume" | "batchTime" | "hourlyRate" | "normCost" | "kgCost";

type ProductionSettings = {
  operationName?: string;
  batchVolume?: number | null;
  batchUnit?: string;
  batchTimeMinutes?: number | null;
  yieldAmount?: number | null;
  yieldUnit?: string;
  laborMinutes?: number | null;
  hourlyRate?: number | null;
  note?: string;
};

type RecipeIngredient = {
  ingredientId?: string;
  name: string;
  article?: string;
  unit?: string;
  grossQuantity?: number | null;
  netQuantity?: number | null;
};

type ProductRecipe = { source: "local" | "iiko"; items: RecipeIngredient[]; rawCount?: number };

type Product = {
  id: string;
  name: string;
  kind: ProductKind;
  type?: string;
  article?: string;
  code?: string;
  measureUnit?: string;
  categoryId?: string;
  category?: string;
  groupId?: string;
  group?: string;
  productionPlace?: string;
  price?: number;
  isLocal?: boolean;
  isArchived?: boolean;
  production?: ProductionSettings;
  recipe?: ProductRecipe;
};

type CategoryCount = { id?: string; category: string; count: number; dishes: number; semifinished: number; goods: number };
type ProductsSummary = {
  semifinished: { total: number; byCategory: CategoryCount[] };
  dishes: { total: number; byCategory: CategoryCount[] };
  goods: { total: number; byCategory: CategoryCount[] };
  allCategories: CategoryCount[];
};
type Dashboard = { products: number; dishes: number; semifinished: number; goods: number; recipes: number; categories: number; revenueTotal: number | null; revenueKitchen: number | null; revenueBar: number | null };
type LastSync = { id: number; finishedAt: string; source: string; totalProducts: number; totalRecipes: number };
type ProductsResponse = { ok: boolean; error?: string; items?: Product[]; summary?: ProductsSummary; dashboard?: Dashboard; lastSync?: LastSync; dbPath?: string; sync?: { saved: number; recipes: number; references: number; syncedAt: string; dbPath: string } };
type ProductFilters = { name: string; categories: string[]; article: string; code: string; unit: string; price: string; batchVolume: string; batchTime: string; hourlyRate: string; normCost: string; kgCost: string };
type SalesFilters = { date: string; dish: string; category: string; department: string; amount: string; revenue: string };
type IngredientDraft = { rowId: string; ingredientId: string; grossQuantity: string };
type SalesRow = { id: string; date?: string; dishName: string; productId?: string; category?: string; department?: string; amount: number; revenue: number; concept?: string; code?: string; group?: string; avgPrice?: number; avgPriceNoDiscount?: number; revenueNoDiscount?: number; grossProfit?: number; markupPercent?: number; discountSum?: number; costPerUnit?: number; costTotal?: number; costPercent?: number; syncedAt: string };
type SalesResponse = { ok: boolean; error?: string; items?: SalesRow[]; total?: number; revenueTotal?: number; sync?: { saved: number; syncedAt: string; endpoint?: string; dbPath: string } };
type InlineRecipeRow = { ingredientId?: string; name: string; article?: string; unit: string; grossQuantity: string };
type WorkshopMapping = { productionPlace: string; workshop: string; position?: string; updatedAt?: string };
type WorkshopDefinition = { id: number; name: string; updatedAt?: string };
type WorkshopsResponse = { ok: boolean; error?: string; items?: WorkshopMapping[]; dbPath?: string };
type WorkshopListResponse = { ok: boolean; error?: string; items?: WorkshopDefinition[]; dbPath?: string };
type CostingRow = { key: string; depth: number; name: string; kind: ProductKind | "unknown"; unit: string; netQuantity: number | null; batchVolume: number | null; batchTimeMinutes: number | null; hourlyRate: number | null; netTimeMinutes: number | null; netCost: number | null; normCost: number | null; kgCost: number | null };

const defaultServerUrl = "https://koza-dereza-slavnya-koza-co.iiko.it/resto";
const emptySummary: ProductsSummary = { semifinished: { total: 0, byCategory: [] }, dishes: { total: 0, byCategory: [] }, goods: { total: 0, byCategory: [] }, allCategories: [] };
const emptyDashboard: Dashboard = { products: 0, dishes: 0, semifinished: 0, goods: 0, recipes: 0, categories: 0, revenueTotal: null, revenueKitchen: null, revenueBar: null };
const productColumnOrder: ProductColumnKey[] = ["name", "category", "article", "code", "unit", "price", "batchVolume", "batchTime", "hourlyRate", "normCost", "kgCost"];
const baseProductColumnOrder: ProductColumnKey[] = ["name", "category", "article", "code", "unit", "price"];
const calculatorProductionPlaces = [
  "Гриль/Гарниры",
  "Кондитерский цех",
  "Супы/Паста",
  "Япония",
  "Раздача",
  "Заготовочный",
  "Мясной",
  "Холодный цех - Закуски",
  "Бизнес-Ланч",
  "Бизнес-Ланч - Паста",
  "Овощной",
  "Завтраки",
  "Гриль/Гарниры - Супы/Паста",
  "Закуски",
  "Бизнез-Ланч - Супы",
  "Холодный цех(Море) - Кондитерский(ост)",
  "Гриль/Гарниры - Холодный цех",
  "Холодный цех - Кондитерский цех",
  "Холодный цех - Раздача",
  "Бизнес Ланч Супы/Паста - Гриль/Гарниры",
  "Япония - Гриль/Гарниры",
  "Холодный цех + Гриль/Гарниры (ДО ЭЛИС)",
];
const calculatorProductionPlaceSet = new Set(calculatorProductionPlaces);

export default function Home() {
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [hasEntered, setHasEntered] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [items, setItems] = useState<Product[]>([]);
  const [summary, setSummary] = useState<ProductsSummary>(emptySummary);
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [lastSync, setLastSync] = useState<LastSync | undefined>();
  const [dbPath, setDbPath] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>("goods");
  const [creatingKind, setCreatingKind] = useState<ProductKind | undefined>();

  const goods = useMemo(() => items.filter((item) => item.kind === "other"), [items]);
  const semifinished = useMemo(() => items.filter((item) => item.kind === "semifinished"), [items]);
  const dishes = useMemo(() => items.filter((item) => item.kind === "dish"), [items]);
  const ingredients = useMemo(() => [...goods, ...semifinished].sort((a, b) => a.name.localeCompare(b.name, "ru")), [goods, semifinished]);
  const visibleItems = activeSheet === "goods" ? goods : activeSheet === "semifinished" ? semifinished : activeSheet === "dishes" ? dishes : [];

  useEffect(() => { if (hasEntered) void loadLocalProducts(false); }, [hasEntered]);

  useEffect(() => {
    if (!hasEntered) return;

    const reloadFromCardSave = () => {
      void loadLocalProducts(false);
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("iiko-chef-products") : undefined;
    const onChannelMessage = (event: MessageEvent) => {
      if (event.data?.type === "product-settings-saved") reloadFromCardSave();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "iiko-chef-products-updated") reloadFromCardSave();
    };
    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "product-settings-saved") reloadFromCardSave();
    };

    channel?.addEventListener("message", onChannelMessage);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onWindowMessage);

    return () => {
      channel?.removeEventListener("message", onChannelMessage);
      channel?.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onWindowMessage);
    };
  }, [hasEntered]);

  async function loadLocalProducts(showMessage = true) {
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/local/products", { cache: "no-store" });
      const data = (await response.json()) as ProductsResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось прочитать локальную базу.");
        return;
      }
      applyProductsResponse(data);
      if (showMessage) setMessage("Данные загружены с вашего компьютера.");
    } catch {
      setError("Не удалось связаться с приложением. Проверьте, что сервер запущен.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/iiko/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serverUrl, login, password }) });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "iiko не принял данные входа.");
        return;
      }
      setPassword("");
      setIsLoggedIn(true);
      setHasEntered(true);
      setActiveSheet("goods");
    } catch {
      setError("Не удалось выполнить вход. Проверьте логин, пароль и доступ к iiko.");
    } finally {
      setIsBusy(false);
    }
  }

  async function syncProducts() {
    setIsBusy(true);
    setError("");
    setMessage("Скачиваю данные из iiko: номенклатуру, категории, единицы и рецепты.");
    try {
      const response = await fetch("/api/iiko/sync", { method: "POST", cache: "no-store" });
      const data = (await response.json()) as ProductsResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось синхронизировать данные iiko.");
        return;
      }
      applyProductsResponse(data);
      setMessage("Синхронизация завершена. Позиции: " + (data.sync?.saved ?? data.dashboard?.products ?? 0) + ", рецепты: " + (data.sync?.recipes ?? data.dashboard?.recipes ?? 0) + ", справочники: " + (data.sync?.references ?? 0) + ".");
    } catch {
      setError("Не удалось выполнить синхронизацию. Проверьте соединение с iiko.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    setIsBusy(true);
    setError("");
    try { await fetch("/api/iiko/logout", { method: "POST" }); }
    finally { setIsBusy(false); setIsLoggedIn(false); setHasEntered(false); setMessage(""); setError(""); }
  }

  function applyProductsResponse(data: ProductsResponse) {
    setItems(data.items ?? []);
    setSummary(data.summary ?? emptySummary);
    setDashboard(data.dashboard ?? emptyDashboard);
    setLastSync(data.lastSync);
    setDbPath(data.dbPath ?? data.sync?.dbPath ?? "");
  }

  function handleCreated(product: Product) {
    setCreatingKind(undefined);
    setMessage("Сохранено в SQLite: " + product.name);
    void loadLocalProducts(false);
  }

  function openProductCard(product: Product) {
    const cardWindow = window.open(
      "/card/" + encodeURIComponent(product.id),
      "product-card-" + product.id,
      "popup=yes,width=980,height=860,left=120,top=80,resizable=yes,scrollbars=yes",
    );
    if (cardWindow) cardWindow.focus();
    else setError("Браузер заблокировал открытие карточки в отдельном окне.");
  }

  if (!hasEntered) {
    return <main className="login-page"><section className="login-card"><h1>iiko Chef</h1><p>Войдите в iiko, чтобы открыть локальную надстройку.</p><form onSubmit={handleLogin}><label className="field"><span>Логин</span><input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" autoFocus /></label><label className="field"><span>Пароль</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label><button className="primary wide" disabled={isBusy} type="submit">Войти</button></form>{error ? <div className="message error login-message">{error}</div> : null}</section></main>;
  }

  return (
    <main className="page">
      <div className="shell app-shell">
        <header className="topbar app-topbar"><div><h1 className="title">iiko Chef</h1><p className="subtitle">Работаем в локальной SQLite. В iiko ничего автоматически не записываем.</p></div><div className="status"><strong>{isBusy ? "Работаю" : "Локальная база"}</strong><span>{lastSync ? formatDate(lastSync.finishedAt) : "ещё не синхронизировано"}</span></div></header>
        <nav className="sheet-tabs" aria-label="Листы">
          <button className={activeSheet === "goods" ? "active" : ""} onClick={() => setActiveSheet("goods")} type="button">Товары <span>{dashboard.goods}</span></button>
          <button className={activeSheet === "semifinished" ? "active" : ""} onClick={() => setActiveSheet("semifinished")} type="button">Заготовки <span>{dashboard.semifinished}</span></button>
          <button className={activeSheet === "dishes" ? "active" : ""} onClick={() => setActiveSheet("dishes")} type="button">Блюда <span>{dashboard.dishes}</span></button>
          <button className={activeSheet === "workshops" ? "active" : ""} onClick={() => setActiveSheet("workshops")} type="button">Цеха</button>
          <button className={activeSheet === "calculator" ? "active" : ""} onClick={() => setActiveSheet("calculator")} type="button">Калькулятор</button>
          <button className={activeSheet === "costing" ? "active" : ""} onClick={() => setActiveSheet("costing")} type="button">Расчет</button>
          <button className={activeSheet === "test" ? "active" : ""} onClick={() => setActiveSheet("test")} type="button">Тест</button>
          <button className={activeSheet === "sales" ? "active" : ""} onClick={() => setActiveSheet("sales")} type="button">Продажи</button>
          <button className={activeSheet === "sync" ? "active" : ""} onClick={() => setActiveSheet("sync")} type="button">Синхронизация</button>
        </nav>
        {message ? <div className="message app-message">{message}</div> : null}{error ? <div className="message error app-message">{error}</div> : null}
        {activeSheet === "sync" ? <SyncSheet dbPath={dbPath} isBusy={isBusy} isLoggedIn={isLoggedIn} lastSync={lastSync} serverUrl={serverUrl} setServerUrl={setServerUrl} onLogout={handleLogout} onReload={() => void loadLocalProducts()} onSync={() => void syncProducts()} /> : null}
        {activeSheet === "sales" ? <SalesSheet isLoggedIn={isLoggedIn} /> : null}
        {activeSheet === "workshops" ? <WorkshopsSheet items={items} /> : null}
        {activeSheet === "calculator" ? <CalculatorSheet items={items} onEdit={openProductCard} onChanged={() => void loadLocalProducts(false)} /> : null}
        {activeSheet === "costing" ? <CostingSheet items={items} onEdit={openProductCard} /> : null}
        {activeSheet === "test" ? <TestSheet items={semifinished} onEdit={openProductCard} /> : null}
        {activeSheet !== "sync" && activeSheet !== "sales" && activeSheet !== "workshops" && activeSheet !== "calculator" && activeSheet !== "costing" && activeSheet !== "test" ? <ProductSheet title={getSheetTitle(activeSheet)} kind={sheetToKind(activeSheet)} items={visibleItems} allItems={items} recipes={dashboard.recipes} onCreate={(kind) => setCreatingKind(kind)} onEdit={openProductCard} onChanged={() => void loadLocalProducts(false)} /> : null}
      </div>
      {creatingKind ? <CreateProductModal kind={creatingKind} sourceProducts={ingredients} existingItems={items} onClose={() => setCreatingKind(undefined)} onCreated={handleCreated} /> : null}
    </main>
  );
}

function ProductSheet({ title, kind, items, allItems, recipes, onCreate, onEdit, onChanged }: { title: string; kind: ProductKind; items: Product[]; allItems: Product[]; recipes: number; onCreate: (kind: ProductKind) => void; onEdit: (product: Product) => void; onChanged: () => void }) {
  const [filters, setFilters] = useState<ProductFilters>({ name: "", categories: [], article: "", code: "", unit: "", price: "", batchVolume: "", batchTime: "", hourlyRate: "", normCost: "", kgCost: "" });
  const [columns, setColumns] = useState<ProductColumnKey[]>(defaultProductColumns(kind));
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ProductColumnKey, number>>>({});
  const [draggedColumn, setDraggedColumn] = useState<ProductColumnKey | undefined>();
  const [dropTarget, setDropTarget] = useState<ProductColumnKey | undefined>();
  const [showArchive, setShowArchive] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ product: Product; x: number; y: number } | undefined>();
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number } | undefined>();
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [openedProductId, setOpenedProductId] = useState<string | undefined>();
  const [detailsById, setDetailsById] = useState<Record<string, Product>>({});
  const [recipeDraftsById, setRecipeDraftsById] = useState<Record<string, InlineRecipeRow[]>>({});
  const [recipeStatus, setRecipeStatus] = useState<Record<string, string>>({});
  const [savingRecipeId, setSavingRecipeId] = useState<string | undefined>();
  const [bulkHourlyRate, setBulkHourlyRate] = useState("");
  const [isBulkRateSaving, setIsBulkRateSaving] = useState(false);
  const [knownCategories, setKnownCategories] = useState<{ key: string; name: string; count: number }[]>(() => buildCategories(items));
  const liveCategories = useMemo(() => buildCategories(items), [items]);
  const categories = useMemo(() => mergeCategories(knownCategories, liveCategories), [knownCategories, liveCategories]);
  const productById = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);
  const filteredItems = items.filter((item) => (showArchive || !item.isArchived) && matchesProductFilters(item, filters));
  const definitions = getProductColumns(onEdit, onChanged, categories, filters, setFilters);
  const canExpandRecipe = kind === "dish" || kind === "semifinished";
  const filteredItemIds = useMemo(() => new Set(filteredItems.map((item) => item.id)), [filteredItems]);
  const selectedProductIdSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const visibleSelectedIds = selectedProductIds.filter((id) => filteredItemIds.has(id));
  const visibleSelectedItems = filteredItems.filter((item) => selectedProductIdSet.has(item.id));
  const selectedActiveItems = visibleSelectedItems.filter((item) => !item.isArchived);
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedProductIdSet.has(item.id));

  useEffect(() => {
    const close = () => {
      setContextMenu(undefined);
      setColumnMenu(undefined);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  useEffect(() => {
    setColumns(defaultProductColumns(kind));
    setColumnMenu(undefined);
  }, [kind]);

  useEffect(() => {
    setKnownCategories((current) => mergeCategories(current, liveCategories));
  }, [liveCategories]);

  useEffect(() => {
    const itemIds = new Set(items.map((item) => item.id));
    setSelectedProductIds((current) => current.filter((id) => itemIds.has(id)));
  }, [items]);

  function moveColumn(target: ProductColumnKey) {
    if (!draggedColumn || draggedColumn === target) return;
    setColumns((current) => moveKey(current, draggedColumn, target));
    setDraggedColumn(undefined);
    setDropTarget(undefined);
  }

  function toggleColumn(key: ProductColumnKey) {
    setColumns((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== key);
      }
      const next = [...current, key];
      return productColumnOrder.filter((item) => next.includes(item));
    });
  }

  function startColumnResize(event: React.MouseEvent, key: ProductColumnKey) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const header = event.currentTarget.parentElement as HTMLElement | null;
    const startWidth = columnWidths[key] ?? header?.getBoundingClientRect().width ?? 120;

    function move(moveEvent: MouseEvent) {
      const nextWidth = Math.max(56, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [key]: nextWidth }));
    }

    function stop() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }

  async function toggleRecipe(item: Product) {
    if (!canExpandRecipe) return;
    const nextOpened = openedProductId === item.id ? undefined : item.id;
    setOpenedProductId(nextOpened);
    if (!nextOpened || detailsById[item.id]) return;
    setRecipeStatus((current) => ({ ...current, [item.id]: "Загружаю состав..." }));
    try {
      const response = await fetch(`/api/local/products/detail?productId=${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; error?: string; product?: Product };
      if (!response.ok || !data.ok || !data.product) {
        setRecipeStatus((current) => ({ ...current, [item.id]: data.error ?? "Не удалось открыть состав." }));
        return;
      }
      setDetailsById((current) => ({ ...current, [item.id]: data.product! }));
      setRecipeDraftsById((current) => ({ ...current, [item.id]: buildInlineRecipeDraft(data.product!.recipe?.items ?? []) }));
      setRecipeStatus((current) => ({ ...current, [item.id]: "" }));
    } catch {
      setRecipeStatus((current) => ({ ...current, [item.id]: "Не удалось открыть состав." }));
    }
  }

  async function archiveProduct(item: Product) {
    const archived = !item.isArchived;
    try {
      const response = await fetch("/api/local/products/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.id, archived }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setRecipeStatus((current) => ({ ...current, [item.id]: data.error ?? "Не удалось изменить архив." }));
        return;
      }
      if (openedProductId === item.id && archived && !showArchive) setOpenedProductId(undefined);
      setContextMenu(undefined);
      onChanged();
    } catch {
      setRecipeStatus((current) => ({ ...current, [item.id]: "Не удалось изменить архив." }));
    }
  }

  async function deleteProduct(item: Product) {
    const ok = window.confirm("Удалить позицию навсегда из локальной базы?");
    if (!ok) return;
    try {
      const response = await fetch("/api/local/products/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.id }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setRecipeStatus((current) => ({ ...current, [item.id]: data.error ?? "Не удалось удалить позицию." }));
        return;
      }
      if (openedProductId === item.id) setOpenedProductId(undefined);
      setContextMenu(undefined);
      onChanged();
    } catch {
      setRecipeStatus((current) => ({ ...current, [item.id]: "Не удалось удалить позицию." }));
    }
  }

  async function deleteSelectedProducts() {
    if (visibleSelectedIds.length === 0) return;
    const ok = window.confirm("Удалить выбранные позиции навсегда из локальной базы?");
    if (!ok) return;
    for (const productId of visibleSelectedIds) {
      const response = await fetch("/api/local/products/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setRecipeStatus((current) => ({ ...current, [productId]: data.error ?? "Не удалось удалить позицию." }));
      }
    }
    setSelectedProductIds([]);
    setOpenedProductId(undefined);
    onChanged();
  }

  async function archiveSelectedProducts() {
    if (selectedActiveItems.length === 0) return;
    for (const productId of selectedActiveItems.map((item) => item.id)) {
      const response = await fetch("/api/local/products/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, archived: true }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setRecipeStatus((current) => ({ ...current, [productId]: data.error ?? "Не удалось убрать позицию в архив." }));
      }
    }
    setSelectedProductIds([]);
    setOpenedProductId(undefined);
    onChanged();
  }

  async function restoreSelectedProducts() {
    if (visibleSelectedIds.length === 0) return;
    for (const productId of visibleSelectedIds) {
      const response = await fetch("/api/local/products/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, archived: false }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setRecipeStatus((current) => ({ ...current, [productId]: data.error ?? "Не удалось вернуть позицию из архива." }));
      }
    }
    setSelectedProductIds([]);
    onChanged();
  }

  async function applyBulkHourlyRate() {
    setIsBulkRateSaving(true);
    try {
      await fetch("/api/local/products/hourly-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourlyRate: parseOptionalNumber(bulkHourlyRate) }),
      });
      onChanged();
    } finally {
      setIsBulkRateSaving(false);
    }
  }

  function toggleSelected(productId: string) {
    setSelectedProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedProductIds((current) => {
      const visibleIds = filteredItems.map((item) => item.id);
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      return current.filter((id) => !visibleIds.includes(id));
    });
  }

  function updateRecipeDraft(productId: string, index: number, patch: Partial<InlineRecipeRow>) {
    setRecipeDraftsById((current) => ({ ...current, [productId]: (current[productId] ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) }));
  }

  async function saveRecipe(productId: string) {
    const detail = detailsById[productId];
    const rows = recipeDraftsById[productId] ?? [];
    if (!detail) return;
    if (rows.some((row) => !row.ingredientId)) {
      setRecipeStatus((current) => ({ ...current, [productId]: "В составе есть строки без связи с номенклатурой. Их пока нельзя сохранить из списка." }));
      return;
    }
    setSavingRecipeId(productId);
    setRecipeStatus((current) => ({ ...current, [productId]: "" }));
    try {
      const response = await fetch("/api/local/product-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          category: detail.group ?? detail.category,
          operationName: detail.production?.operationName,
          batchVolume: detail.production?.batchVolume ?? null,
          batchUnit: detail.production?.batchUnit,
          batchTimeMinutes: detail.production?.batchTimeMinutes ?? null,
          yieldAmount: detail.production?.yieldAmount ?? null,
          yieldUnit: detail.production?.yieldUnit,
          laborMinutes: detail.production?.laborMinutes ?? null,
          hourlyRate: detail.production?.hourlyRate ?? null,
          note: detail.production?.note,
          recipeItems: rows.filter((row) => row.ingredientId).map((row) => ({ ingredientId: row.ingredientId, grossQuantity: parseOptionalNumber(row.grossQuantity), unit: row.unit })),
        }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string; product?: Product };
      if (!response.ok || !data.ok || !data.product) {
        setRecipeStatus((current) => ({ ...current, [productId]: data.error ?? "Не удалось сохранить состав." }));
        return;
      }
      setDetailsById((current) => ({ ...current, [productId]: data.product! }));
      setRecipeDraftsById((current) => ({ ...current, [productId]: buildInlineRecipeDraft(data.product!.recipe?.items ?? []) }));
      setRecipeStatus((current) => ({ ...current, [productId]: "Состав сохранен." }));
      onChanged();
    } catch {
      setRecipeStatus((current) => ({ ...current, [productId]: "Не удалось сохранить состав." }));
    } finally {
      setSavingRecipeId(undefined);
    }
  }

  return (
    <section className="panel product-sheet">
      <div className="section-head list-head"><div><h2>{title}</h2><p>Показано {filteredItems.length} из {items.length}. Рецептов в SQLite: {recipes}.</p></div><div className="list-actions">{kind !== "other" ? <label className="bulk-rate-field"><span>Ставка часа</span><input value={bulkHourlyRate} onChange={(event) => setBulkHourlyRate(event.target.value)} inputMode="decimal" placeholder="0" /><button className="secondary" disabled={isBulkRateSaving} onClick={() => void applyBulkHourlyRate()} type="button">{isBulkRateSaving ? "..." : "Проставить"}</button></label> : null}<button className="secondary" disabled={selectedActiveItems.length === 0} onClick={() => void archiveSelectedProducts()} type="button">В архив {selectedActiveItems.length ? selectedActiveItems.length : ""}</button><button className="secondary" disabled={!showArchive || visibleSelectedIds.length === 0} onClick={() => void restoreSelectedProducts()} type="button">Вернуть выбранные {showArchive && visibleSelectedIds.length ? visibleSelectedIds.length : ""}</button><button className="secondary danger-action" disabled={visibleSelectedIds.length === 0} onClick={() => void deleteSelectedProducts()} type="button">Удалить выбранные {visibleSelectedIds.length ? visibleSelectedIds.length : ""}</button><details className="view-menu"><summary>Вид</summary><div className="view-menu-panel" onMouseLeave={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }}><label><input checked={showArchive} onChange={(event) => setShowArchive(event.target.checked)} type="checkbox" /> Отображать архив</label></div></details><button className="primary" onClick={() => onCreate(kind)} type="button">Добавить {createNoun(kind)}</button></div></div>
      <div className="product-table-wrap"><table className="product-table"><thead><tr>{columns.map((key) => {
        const column = definitions[key];
        const className = ["draggable-th", draggedColumn === key ? "is-dragging" : "", dropTarget === key && draggedColumn !== key ? "is-drop-target" : ""].filter(Boolean).join(" ");
        return key === columns[0] ? <Fragment key={key}><th className="select-column"><input checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} type="checkbox" /></th><th className={className} draggable onContextMenu={(event) => { event.preventDefault(); setColumnMenu({ x: event.clientX, y: event.clientY }); }} onDragStart={() => setDraggedColumn(key)} onDragEnter={() => setDropTarget(key)} onDragOver={(event) => { event.preventDefault(); setDropTarget(key); }} onDragEnd={() => { setDraggedColumn(undefined); setDropTarget(undefined); }} onDrop={() => moveColumn(key)} style={{ width: columnWidths[key] ? `${columnWidths[key]}px` : column.width }}><div className="th-label">{column.label}</div>{column.filter}<span className="column-resizer" onMouseDown={(event) => startColumnResize(event, key)} /></th></Fragment> : <th className={className} draggable key={key} onContextMenu={(event) => { event.preventDefault(); setColumnMenu({ x: event.clientX, y: event.clientY }); }} onDragStart={() => setDraggedColumn(key)} onDragEnter={() => setDropTarget(key)} onDragOver={(event) => { event.preventDefault(); setDropTarget(key); }} onDragEnd={() => { setDraggedColumn(undefined); setDropTarget(undefined); }} onDrop={() => moveColumn(key)} style={{ width: columnWidths[key] ? `${columnWidths[key]}px` : column.width }}><div className="th-label">{column.label}</div>{column.filter}<span className="column-resizer" onMouseDown={(event) => startColumnResize(event, key)} /></th>;
      })}</tr></thead><tbody>{filteredItems.map((item) => {
        const isOpen = openedProductId === item.id;
        return <Fragment key={item.id}><tr className={[canExpandRecipe ? "expandable-product-row" : "", item.isArchived ? "archived-product-row" : "", selectedProductIdSet.has(item.id) ? "selected-product-row" : ""].filter(Boolean).join(" ")} onClick={() => void toggleRecipe(item)} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ product: item, x: event.clientX, y: event.clientY }); }} onDoubleClick={() => onEdit(item)}>{columns.map((key) => key === columns[0] ? <Fragment key={key}><td className="select-column"><input checked={selectedProductIdSet.has(item.id)} onChange={() => toggleSelected(item.id)} onClick={(event) => event.stopPropagation()} type="checkbox" /></td><td>{definitions[key].render(item)}</td></Fragment> : <td key={key}>{definitions[key].render(item)}</td>)}</tr>{isOpen ? <tr className="inline-recipe-container-row"><td colSpan={columns.length + 1}><InlineRecipeEditor productById={productById} rows={recipeDraftsById[item.id] ?? []} status={recipeStatus[item.id]} isSaving={savingRecipeId === item.id} onChange={(index, patch) => updateRecipeDraft(item.id, index, patch)} onEdit={onEdit} onProductChanged={onChanged} onSave={() => void saveRecipe(item.id)} /></td></tr> : null}</Fragment>;
      })}</tbody></table></div>
      {contextMenu ? <div className="row-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><button onClick={() => void archiveProduct(contextMenu.product)} type="button">{contextMenu.product.isArchived ? "Вернуть из архива" : "Убрать в архив"}</button><button className="danger-menu-button" onClick={() => void deleteProduct(contextMenu.product)} type="button">Удалить навсегда</button></div> : null}
      {columnMenu ? <div className="row-context-menu column-context-menu" style={{ left: columnMenu.x, top: columnMenu.y }} onClick={(event) => event.stopPropagation()}>{productColumnOrder.map((key) => <label key={key}><input checked={columns.includes(key)} disabled={columns.length === 1 && columns.includes(key)} onChange={() => toggleColumn(key)} type="checkbox" /> {definitions[key].label}</label>)}</div> : null}
      {filteredItems.length === 0 ? <div className="empty">Нет строк по текущим фильтрам.</div> : null}
    </section>
  );
}

function InlineRecipeEditor({ rows, productById, status, isSaving, onChange, onEdit, onProductChanged, onSave }: { rows: InlineRecipeRow[]; productById: Map<string, Product>; status?: string; isSaving: boolean; onChange: (index: number, patch: Partial<InlineRecipeRow>) => void; onEdit: (product: Product) => void; onProductChanged: () => void; onSave: () => void }) {
  return (
    <div className="inline-recipe-editor">
      <div className="inline-recipe-head"><strong>Ингредиент</strong><span>Ед.</span><span>Нетто, кг</span><span>Время нетто, мин</span><span>Стоимость нетто, руб</span><span>Норма, кг</span><span>Время нормы, мин</span><span>Ст. нормы, руб</span><span>Стоимость 1 кг, руб</span></div>
      {rows.length > 0 ? <RecipeTreeRows rows={rows} productById={productById} editable onChange={onChange} onEdit={onEdit} onProductChanged={onProductChanged} /> : <div className="inline-recipe-empty">Состав пока не найден.</div>}
      <div className="inline-recipe-actions"><span>{status ?? ""}</span><button className="secondary" disabled={isSaving || rows.length === 0} onClick={onSave} type="button">{isSaving ? "Сохраняю..." : "Сохранить состав"}</button></div>
    </div>
  );
}

function RecipeTreeRows({ rows, productById, editable = false, depth = 0, multiplier = 1, onChange, onEdit, onProductChanged }: { rows: InlineRecipeRow[]; productById: Map<string, Product>; editable?: boolean; depth?: number; multiplier?: number; onChange?: (index: number, patch: Partial<InlineRecipeRow>) => void; onEdit: (product: Product) => void; onProductChanged: () => void }) {
  const [openedIngredientIds, setOpenedIngredientIds] = useState<string[]>([]);
  const [nestedRowsById, setNestedRowsById] = useState<Record<string, InlineRecipeRow[]>>({});
  const [nestedStatusById, setNestedStatusById] = useState<Record<string, string>>({});

  async function toggleNested(ingredient: Product | undefined) {
    if (!ingredient || ingredient.kind !== "semifinished") return;
    const isOpen = openedIngredientIds.includes(ingredient.id);
    setOpenedIngredientIds((current) => isOpen ? current.filter((id) => id !== ingredient.id) : [...current, ingredient.id]);
    if (isOpen || nestedRowsById[ingredient.id]) return;
    setNestedStatusById((current) => ({ ...current, [ingredient.id]: "Загружаю состав..." }));
    try {
      const response = await fetch(`/api/local/products/detail?productId=${encodeURIComponent(ingredient.id)}`, { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; error?: string; product?: Product };
      if (!response.ok || !data.ok || !data.product) {
        setNestedStatusById((current) => ({ ...current, [ingredient.id]: data.error ?? "Не удалось открыть состав." }));
        return;
      }
      setNestedRowsById((current) => ({ ...current, [ingredient.id]: buildInlineRecipeDraft(data.product!.recipe?.items ?? []) }));
      setNestedStatusById((current) => ({ ...current, [ingredient.id]: "" }));
    } catch {
      setNestedStatusById((current) => ({ ...current, [ingredient.id]: "Не удалось открыть состав." }));
    }
  }

  return (
    <>
      {rows.map((row, index) => {
        const ingredient = row.ingredientId ? productById.get(row.ingredientId) : undefined;
        const canEditProduction = ingredient?.kind === "semifinished";
        const isNestedOpen = Boolean(canEditProduction && openedIngredientIds.includes(ingredient.id));
        const nestedRows = ingredient ? nestedRowsById[ingredient.id] ?? [] : [];
        const nestedStatus = ingredient ? nestedStatusById[ingredient.id] : "";
        const childMultiplier = ingredient ? nestedMultiplierFor(row, ingredient, multiplier) : multiplier;
        return (
          <Fragment key={`${row.ingredientId ?? row.name}-${index}-${depth}`}>
            <div className="inline-recipe-row" style={{ "--recipe-depth": depth } as CSSProperties}>
              {canEditProduction ? <button className={isNestedOpen ? "inline-ingredient-button active" : "inline-ingredient-button"} onClick={() => void toggleNested(ingredient)} onDoubleClick={(event) => { event.stopPropagation(); onEdit(ingredient); }} title="Один клик раскрывает состав, двойной открывает карточку" type="button">{row.name}</button> : <strong>{row.name}</strong>}
              {editable ? <input value={row.unit} onChange={(event) => onChange?.(index, { unit: event.target.value })} /> : <span>{row.unit}</span>}
              {editable ? <input value={row.grossQuantity} onChange={(event) => onChange?.(index, { grossQuantity: event.target.value })} inputMode="decimal" /> : <span>{formatScaledNet(row, multiplier)}</span>}
              <span>{ingredient ? formatNetProductionTime(row, ingredient, multiplier) : ""}</span>
              <span>{ingredient ? formatNetProductionCost(row, ingredient, multiplier) : ""}</span>
              {canEditProduction ? <ProductBatchValueCell item={ingredient} field="batchVolume" onChanged={onProductChanged} /> : <span></span>}
              {canEditProduction ? <ProductBatchValueCell item={ingredient} field="batchTimeMinutes" onChanged={onProductChanged} /> : <span></span>}
              <span>{ingredient ? formatProductionNormCost(ingredient) : ""}</span>
              <span>{ingredient ? formatProductionKgCost(ingredient) : ""}</span>
            </div>
            {isNestedOpen ? nestedStatus ? <div className="inline-nested-message" style={{ "--recipe-depth": depth + 1 } as CSSProperties}>{nestedStatus}</div> : nestedRows.length ? <RecipeTreeRows rows={nestedRows} productById={productById} depth={depth + 1} multiplier={childMultiplier} onEdit={onEdit} onProductChanged={onProductChanged} /> : <div className="inline-nested-message" style={{ "--recipe-depth": depth + 1 } as CSSProperties}>Состав вложенной заготовки пока не найден.</div> : null}
          </Fragment>
        );
      })}
    </>
  );
}

function getProductColumns(onEdit: (product: Product) => void, onChanged: () => void, categories: { key: string; name: string; count: number }[], filters: ProductFilters, setFilters: (filters: ProductFilters) => void) {
  return {
    name: { label: "Название", width: "34%", filter: <input className="header-filter" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} placeholder="Поиск" />, render: (item: Product) => <button className="name-cell-button" onDoubleClick={(event) => { event.stopPropagation(); if (event.button === 0) onEdit(item); }} title="Открыть карточку двойным нажатием" type="button">{item.name}{item.isLocal ? <em className="local-mark">локально</em> : null}</button> },
    category: { label: "Категория", width: "25%", filter: <CategoryMultiFilter categories={categories} selected={filters.categories} onSelected={(next) => setFilters({ ...filters, categories: next })} />, render: (item: Product) => item.group ?? item.category ?? "Без категории" },
    article: { label: "Артикул", width: "12%", filter: <input className="header-filter" value={filters.article} onChange={(e) => setFilters({ ...filters, article: e.target.value })} placeholder="Поиск" />, render: (item: Product) => item.article ?? "" },
    code: { label: "Код", width: "10%", filter: <input className="header-filter" value={filters.code} onChange={(e) => setFilters({ ...filters, code: e.target.value })} placeholder="Поиск" />, render: (item: Product) => item.code ?? "" },
    unit: { label: "Ед.", width: "8%", filter: <input className="header-filter" value={filters.unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value })} placeholder="Ед." />, render: (item: Product) => item.measureUnit ?? "" },
    price: { label: "Цена", width: "11%", filter: <input className="header-filter" value={filters.price} onChange={(e) => setFilters({ ...filters, price: e.target.value })} placeholder="Поиск" />, render: (item: Product) => typeof item.price === "number" ? formatMoney(item.price) : "" },
    batchVolume: { label: "Норма, кг", width: "13%", filter: <input className="header-filter" value={filters.batchVolume} onChange={(e) => setFilters({ ...filters, batchVolume: e.target.value })} placeholder="Поиск" />, render: (item: Product) => <ProductBatchValueCell item={item} field="batchVolume" onChanged={onChanged} /> },
    batchTime: { label: "Время, мин", width: "13%", filter: <input className="header-filter" value={filters.batchTime} onChange={(e) => setFilters({ ...filters, batchTime: e.target.value })} placeholder="Мин" />, render: (item: Product) => <ProductBatchValueCell item={item} field="batchTimeMinutes" onChanged={onChanged} /> },
    hourlyRate: { label: "Ставка, руб", width: "12%", filter: <input className="header-filter" value={filters.hourlyRate} onChange={(e) => setFilters({ ...filters, hourlyRate: e.target.value })} placeholder="Поиск" />, render: (item: Product) => <ProductBatchValueCell item={item} field="hourlyRate" onChanged={onChanged} /> },
    normCost: { label: "Ст. нормы, руб", width: "13%", filter: <input className="header-filter" value={filters.normCost} onChange={(e) => setFilters({ ...filters, normCost: e.target.value })} placeholder="Поиск" />, render: (item: Product) => formatProductionNormCost(item) },
    kgCost: { label: "Ст. 1 кг, руб", width: "13%", filter: <input className="header-filter" value={filters.kgCost} onChange={(e) => setFilters({ ...filters, kgCost: e.target.value })} placeholder="Поиск" />, render: (item: Product) => formatProductionKgCost(item) },
  } satisfies Record<ProductColumnKey, { label: string; width: string; filter: ReactNode; render: (item: Product) => ReactNode }>;
}

function ProductBatchValueCell({ item, field, onChanged }: { item: Product; field: "batchVolume" | "batchTimeMinutes" | "hourlyRate"; onChanged: () => void }) {
  const [value, setValue] = useState(numberToText(item.production?.[field]));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(numberToText(item.production?.[field]));
  }, [field, item.production, item.id]);

  async function save() {
    const currentValue = numberToText(item.production?.[field]);
    if (value.trim() === currentValue) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/local/product-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: item.id,
          category: item.group ?? item.category,
          operationName: item.production?.operationName,
          batchVolume: field === "batchVolume" ? parseOptionalNumber(value) : item.production?.batchVolume ?? null,
          batchUnit: item.production?.batchUnit ?? item.measureUnit,
          batchTimeMinutes: field === "batchTimeMinutes" ? parseOptionalNumber(value) : item.production?.batchTimeMinutes ?? null,
          yieldAmount: item.production?.yieldAmount ?? null,
          yieldUnit: item.production?.yieldUnit,
          laborMinutes: item.production?.laborMinutes ?? null,
          hourlyRate: field === "hourlyRate" ? parseOptionalNumber(value) : item.production?.hourlyRate ?? null,
          note: item.production?.note,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || data.ok === false) throw new Error(data.error ?? "Не сохранено");
      onChanged();
    } catch {
      setValue(currentValue);
    } finally {
      setIsSaving(false);
    }
  }

  return <input className="inline-table-input" disabled={isSaving} value={value} onBlur={() => void save()} onChange={(event) => setValue(event.target.value)} onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} inputMode="decimal" />;
}

function CategoryMultiFilter({ categories, selected, onSelected }: { categories: { key: string; name: string; count: number }[]; selected: string[]; onSelected: (selected: string[]) => void }) {
  const [query, setQuery] = useState("");
  const visibleCategories = categories.filter((category) => includes(category.name, query));

  function toggle(key: string) {
    onSelected(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key]);
  }

  function selectVisible() {
    onSelected(Array.from(new Set([...selected, ...visibleCategories.map((category) => category.key)])));
  }

  function clearVisible() {
    const visibleKeys = new Set(visibleCategories.map((category) => category.key));
    onSelected(selected.filter((key) => !visibleKeys.has(key)));
  }

  return <details className="category-filter-menu" onMouseLeave={(event) => { event.currentTarget.open = false; }}><summary>{selected.length ? `Выбрано: ${selected.length}` : "Все"}</summary><div className="category-filter-panel"><input className="category-filter-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти категорию" /><div className="category-filter-actions"><button className="small-button" onClick={selectVisible} type="button">Выделить все</button><button className="small-button" onClick={clearVisible} type="button">Снять все</button></div>{visibleCategories.map((category) => <label key={category.key}><input checked={selected.includes(category.key)} onChange={() => toggle(category.key)} type="checkbox" /> {category.name} <span>{category.count}</span></label>)}{visibleCategories.length === 0 ? <div className="category-filter-empty">Ничего не найдено.</div> : null}</div></details>;
}

function CalculatorSheet({ items, onEdit, onChanged }: { items: Product[]; onEdit: (product: Product) => void; onChanged: () => void }) {
  const unknownPlace = "Неопределенные";
  const [openedPlace, setOpenedPlace] = useState<string | undefined>();
  const places = useMemo(() => {
    const groups = new Map<string, { place: string; count: number; completed: number; items: Product[] }>();
    for (const item of items) {
      const place = cookingPlaceLabel(item, unknownPlace);
      if (!calculatorProductionPlaceSet.has(place)) continue;
      const current = groups.get(place) ?? { place, count: 0, completed: 0, items: [] };
      current.count += 1;
      current.items.push(item);
      const batchVolume = item.production?.batchVolume;
      const batchTimeMinutes = item.production?.batchTimeMinutes;
      const hasBatchVolume = typeof batchVolume === "number";
      const hasBatchTime = typeof batchTimeMinutes === "number";
      if (hasBatchVolume && hasBatchTime) current.completed += 1;
      groups.set(place, current);
    }
    return calculatorProductionPlaces.map((place) => groups.get(place)).filter((place): place is NonNullable<typeof place> => Boolean(place)).map((place) => ({ ...place, items: place.items.sort((a, b) => a.name.localeCompare(b.name, "ru")) }));
  }, [items]);

  return (
    <section className="panel calculator-sheet">
      <div className="section-head list-head">
        <div>
          <h2>Калькулятор</h2>
          <p>Список типов места приготовления. Далее здесь свяжем объем партии и время партии для расчета загрузки.</p>
        </div>
      </div>
      <div className="calculator-list">
        <div className="calculator-row calculator-head"><strong>Тип места приготовления</strong><span>Позиций</span><span>Объем партии</span><span>Время партии, мин</span><span>Статус</span></div>
        {places.map((place) => {
          const isOpen = openedPlace === place.place;
          return (
            <div className="calculator-group" key={place.place}>
              <button className={isOpen ? "calculator-row calculator-place-row active" : "calculator-row calculator-place-row"} onClick={() => setOpenedPlace(isOpen ? undefined : place.place)} type="button"><strong>{place.place}</strong><span>{place.count} / {place.completed}</span><span></span><span></span><span></span></button>
              {isOpen ? <div className="calculator-name-list">{place.items.map((item) => <CalculatorProductionRow item={item} key={item.id} onChanged={onChanged} onEdit={onEdit} />)}</div> : null}
            </div>
          );
        })}
      </div>
      {places.length === 0 ? <div className="empty">Типы места приготовления пока не найдены.</div> : null}
    </section>
  );
}

function WorkshopsSheet({ items }: { items: Product[] }) {
  const unknownPlace = "Неопределенные";
  const productionPlaces = useMemo(() => uniqueValues(items.map((item) => cookingPlaceLabel(item, unknownPlace))).filter((place) => place !== unknownPlace), [items]);
  const [mappings, setMappings] = useState<Record<string, WorkshopMapping>>({});
  const [workshops, setWorkshops] = useState<WorkshopDefinition[]>([]);
  const [newWorkshopName, setNewWorkshopName] = useState("");
  const [workshopMessage, setWorkshopMessage] = useState("");
  const [statusByPlace, setStatusByPlace] = useState<Record<string, string>>({});
  const [savingPlace, setSavingPlace] = useState<string | undefined>();

  useEffect(() => {
    void loadWorkshopsState();
  }, []);

  async function loadWorkshopsState() {
    try {
      const [mappingsResponse, listResponse] = await Promise.all([
        fetch("/api/local/workshops", { cache: "no-store" }),
        fetch("/api/local/workshop-list", { cache: "no-store" }),
      ]);
      const mappingsData = (await mappingsResponse.json()) as WorkshopsResponse;
      const listData = (await listResponse.json()) as WorkshopListResponse;
      if (mappingsResponse.ok && mappingsData.ok) setMappings(Object.fromEntries((mappingsData.items ?? []).map((item) => [item.productionPlace, item])));
      if (listResponse.ok && listData.ok) setWorkshops(listData.items ?? []);
    } catch {
      // The sheet can still work with empty local mappings.
    }
  }

  function updateMapping(productionPlace: string, patch: Partial<WorkshopMapping>) {
    setMappings((current) => ({ ...current, [productionPlace]: { ...(current[productionPlace] ?? { productionPlace, workshop: "" }), ...patch } }));
  }

  async function saveMapping(productionPlace: string) {
    const mapping = mappings[productionPlace] ?? { productionPlace, workshop: "" };
    setSavingPlace(productionPlace);
    setStatusByPlace((current) => ({ ...current, [productionPlace]: "" }));
    try {
      const response = await fetch("/api/local/workshops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapping),
      });
      const data = (await response.json()) as WorkshopsResponse;
      if (!response.ok || !data.ok) {
        setStatusByPlace((current) => ({ ...current, [productionPlace]: data.error ?? "Не сохранено" }));
        return;
      }
      setMappings(Object.fromEntries((data.items ?? []).map((item) => [item.productionPlace, item])));
      setStatusByPlace((current) => ({ ...current, [productionPlace]: "Сохранено" }));
    } catch {
      setStatusByPlace((current) => ({ ...current, [productionPlace]: "Не сохранено" }));
    } finally {
      setSavingPlace(undefined);
    }
  }

  async function addWorkshop() {
    setWorkshopMessage("");
    try {
      const response = await fetch("/api/local/workshop-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkshopName }),
      });
      const data = (await response.json()) as WorkshopListResponse;
      if (!response.ok || !data.ok) {
        setWorkshopMessage(data.error ?? "Не удалось добавить цех.");
        return;
      }
      setWorkshops(data.items ?? []);
      setNewWorkshopName("");
    } catch {
      setWorkshopMessage("Не удалось добавить цех.");
    }
  }

  async function deleteWorkshop(workshop: WorkshopDefinition) {
    const ok = window.confirm(`Удалить цех "${workshop.name}" из справочника?`);
    if (!ok) return;
    setWorkshopMessage("");
    try {
      const response = await fetch("/api/local/workshop-list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: workshop.id }),
      });
      const data = (await response.json()) as WorkshopListResponse;
      if (!response.ok || !data.ok) {
        setWorkshopMessage(data.error ?? "Не удалось удалить цех.");
        return;
      }
      setWorkshops(data.items ?? []);
      await loadWorkshopsState();
    } catch {
      setWorkshopMessage("Не удалось удалить цех.");
    }
  }

  return <section className="panel workshops-sheet"><div className="section-head list-head"><div><h2>Цеха</h2><p>Здесь связываем тип места приготовления с цехом. Поле должности оставлено для следующего этапа.</p></div></div><div className="workshop-directory"><div className="workshop-directory-head"><strong>Список цехов</strong><div><input value={newWorkshopName} onChange={(event) => setNewWorkshopName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addWorkshop(); }} placeholder="Новый цех" /><button className="small-button" onClick={() => void addWorkshop()} type="button">Добавить</button></div></div><div className="workshop-chip-list">{workshops.map((workshop) => <span className="workshop-chip" key={workshop.id}>{workshop.name}<button aria-label={`Удалить ${workshop.name}`} onClick={() => void deleteWorkshop(workshop)} type="button">x</button></span>)}{workshops.length === 0 ? <em>Список цехов пока пуст.</em> : null}</div>{workshopMessage ? <div className="inline-warning">{workshopMessage}</div> : null}</div><div className="workshop-table"><div className="workshop-row workshop-head"><strong>Тип места приготовления</strong><span>Цех</span><span>Должность</span><span></span><span>Статус</span></div>{productionPlaces.map((place) => { const mapping = mappings[place] ?? { productionPlace: place, workshop: "", position: "" }; return <div className="workshop-row" key={place}><strong>{place}</strong><select value={mapping.workshop} onChange={(event) => updateMapping(place, { workshop: event.target.value })}><option value="">Не выбран</option>{workshops.map((workshop) => <option key={workshop.id} value={workshop.name}>{workshop.name}</option>)}</select><input value={mapping.position ?? ""} onChange={(event) => updateMapping(place, { position: event.target.value })} placeholder="Позже: должность" /><button className="small-button" disabled={savingPlace === place} onClick={() => void saveMapping(place)} type="button">{savingPlace === place ? "..." : "OK"}</button><span>{statusByPlace[place] ?? ""}</span></div>; })}</div>{productionPlaces.length === 0 ? <div className="empty">Типы места приготовления пока не найдены.</div> : null}</section>;
}

function CalculatorProductionRow({ item, onChanged, onEdit }: { item: Product; onChanged: () => void; onEdit: (product: Product) => void }) {
  const [batchVolume, setBatchVolume] = useState(numberToText(item.production?.batchVolume));
  const [batchTimeMinutes, setBatchTimeMinutes] = useState(numberToText(item.production?.batchTimeMinutes));
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setBatchVolume(numberToText(item.production?.batchVolume));
    setBatchTimeMinutes(numberToText(item.production?.batchTimeMinutes));
  }, [item.production?.batchTimeMinutes, item.production?.batchVolume]);

  async function save() {
    setIsSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/local/product-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: item.id,
          category: item.group ?? item.category,
          operationName: item.production?.operationName,
          batchVolume: parseOptionalNumber(batchVolume),
          batchUnit: item.production?.batchUnit ?? item.measureUnit,
          batchTimeMinutes: parseOptionalNumber(batchTimeMinutes),
          yieldAmount: item.production?.yieldAmount ?? null,
          yieldUnit: item.production?.yieldUnit,
          laborMinutes: item.production?.laborMinutes ?? null,
          hourlyRate: item.production?.hourlyRate ?? null,
          note: item.production?.note,
        }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setStatus(data.error ?? "Не сохранено");
        return;
      }
      setStatus("Сохранено");
      onChanged();
    } catch {
      setStatus("Не сохранено");
    } finally {
      setIsSaving(false);
    }
  }

  return <div className="calculator-name-row editable-calculator-row"><button className="calculator-inline-name" onDoubleClick={(event) => { if (event.button === 0) onEdit(item); }} title="Открыть карточку двойным нажатием" type="button">{item.name}</button><input value={batchVolume} onChange={(event) => setBatchVolume(event.target.value)} inputMode="decimal" placeholder="Объем" /><input value={batchTimeMinutes} onChange={(event) => setBatchTimeMinutes(event.target.value)} inputMode="decimal" placeholder="Мин" /><button className="small-button" disabled={isSaving} onClick={() => void save()} type="button">{isSaving ? "..." : "OK"}</button><span>{status}</span></div>;
}

function CostingSheet({ items, onEdit }: { items: Product[]; onEdit: (product: Product) => void }) {
  const candidates = useMemo(() => items.filter((item) => item.kind === "dish" || item.kind === "semifinished").sort((a, b) => a.name.localeCompare(b.name, "ru")), [items]);
  const defaultProduct = useMemo(() => candidates.find((item) => item.name.toLowerCase().includes("борщ с вишней")) ?? candidates[0], [candidates]);
  const [selectedId, setSelectedId] = useState(defaultProduct?.id ?? "");
  const [query, setQuery] = useState("");
  const [portionRows, setPortionRows] = useState<CostingRow[]>([]);
  const [batchRows, setBatchRows] = useState<CostingRow[]>([]);
  const [status, setStatus] = useState("");
  const productById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const filteredCandidates = candidates.filter((item) => includes(item.name, query));
  const selected = candidates.find((item) => item.id === selectedId) ?? defaultProduct;

  useEffect(() => {
    if (!selectedId && defaultProduct) setSelectedId(defaultProduct.id);
  }, [defaultProduct, selectedId]);

  useEffect(() => {
    let isCancelled = false;
    async function rebuild() {
      if (!selected) return;
      setStatus("Считаю...");
      try {
        const cache = new Map<string, Product>();
        const detail = await fetchProductDetail(selected.id, cache, productById);
        const nextPortionRows = detail.kind === "semifinished"
          ? await buildSemifinishedBatchRows(detail, 0, cache, productById, new Set())
          : await buildRecipeCostRows(detail, 1, 0, cache, productById, new Set());
        const nextBatchRows = detail.kind === "semifinished"
          ? await buildSemifinishedBatchRows(detail, 0, cache, productById, new Set())
          : await buildTopSemifinishedBatchRows(detail, cache, productById);
        if (!isCancelled) {
          setPortionRows(nextPortionRows);
          setBatchRows(nextBatchRows);
          setStatus("");
        }
      } catch {
        if (!isCancelled) setStatus("Не удалось рассчитать.");
      }
    }
    void rebuild();
    return () => { isCancelled = true; };
  }, [productById, selected]);

  const portionTotal = summarizeCostRows(portionRows);
  const batchTotal = summarizeCostRows(batchRows);

  return (
    <section className="panel costing-sheet">
      <div className="section-head list-head">
        <div>
          <h2>Расчет</h2>
          <p>Проверяем формат расчета времени и стоимости по вложенным заготовкам.</p>
        </div>
        <div className="costing-picker">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо или заготовку" />
          <select value={selected?.id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
            {filteredCandidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {selected ? <button className="secondary" onClick={() => onEdit(selected)} type="button">Карточка</button> : null}
        </div>
      </div>
      {selected ? <div className="costing-summary"><strong>{selected.name}</strong><span>1 порция: {formatMinutes(portionTotal.minutes)} / {formatRubles(portionTotal.cost)}</span><span>Партия: {formatMinutes(batchTotal.minutes)} / {formatRubles(batchTotal.cost)}</span><em>{status}</em></div> : null}
      <CostingTable rows={portionRows} title={selected?.kind === "semifinished" ? "Текущая норма заготовки" : "1 порция"} />
      <CostingTable rows={batchRows} title={selected?.kind === "semifinished" ? "Полная партия заготовки" : "Партии верхних заготовок"} />
    </section>
  );
}

function CostingTable({ rows, title }: { rows: CostingRow[]; title: string }) {
  const total = summarizeCostRows(rows);
  return (
    <div className="costing-table-block">
      <div className="costing-table-title"><strong>{title}</strong><span>Итого: {formatMinutes(total.minutes)} / {formatRubles(total.cost)}</span></div>
      <div className="costing-table">
        <div className="costing-row costing-head"><strong>Наименование</strong><span>Ед.</span><span>Нетто</span><span>Норма</span><span>Время нормы</span><span>Время нетто</span><span>Стоимость нетто</span><span>Стоимость 1 кг</span></div>
        {rows.length ? rows.map((row) => <div className="costing-row" key={row.key} style={{ "--recipe-depth": row.depth } as CSSProperties}><strong>{row.name}</strong><span>{row.unit}</span><span>{formatOptionalNumber(row.netQuantity)}</span><span>{formatOptionalNumber(row.batchVolume)}</span><span>{formatOptionalNumber(row.batchTimeMinutes)}</span><span>{formatOptionalNumber(row.netTimeMinutes)}</span><span>{formatRubles(row.netCost)}</span><span>{formatRubles(row.kgCost)}</span></div>) : <div className="inline-recipe-empty">Нет данных для расчета.</div>}
      </div>
    </div>
  );
}

async function fetchProductDetail(productId: string, cache: Map<string, Product>, productById: Map<string, Product>) {
  const cached = cache.get(productId);
  if (cached) return cached;
  const fallback = productById.get(productId);
  const response = await fetch(`/api/local/products/detail?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
  const data = (await response.json()) as { ok: boolean; product?: Product };
  const product = data.ok && data.product ? data.product : fallback;
  if (!product) throw new Error("Product not found");
  cache.set(productId, product);
  return product;
}

async function buildTopSemifinishedBatchRows(root: Product, cache: Map<string, Product>, productById: Map<string, Product>) {
  const rows: CostingRow[] = [];
  for (const item of root.recipe?.items ?? []) {
    if (!item.ingredientId) continue;
    const ingredient = await fetchProductDetail(item.ingredientId, cache, productById);
    if (ingredient.kind !== "semifinished") continue;
    rows.push(...await buildSemifinishedBatchRows(ingredient, 0, cache, productById, new Set()));
  }
  return rows;
}

async function buildSemifinishedBatchRows(product: Product, depth: number, cache: Map<string, Product>, productById: Map<string, Product>, trail: Set<string>) {
  const batchVolume = product.production?.batchVolume ?? null;
  const rows = [buildOperationCostRow(product, batchVolume, depth, `${product.id}:batch:${depth}`)];
  rows.push(...await buildRecipeCostRows(product, 1, depth + 1, cache, productById, trail));
  return rows;
}

async function buildRecipeCostRows(product: Product, multiplier: number, depth: number, cache: Map<string, Product>, productById: Map<string, Product>, trail: Set<string>): Promise<CostingRow[]> {
  if (trail.has(product.id)) return [];
  const nextTrail = new Set(trail);
  nextTrail.add(product.id);
  const rows: CostingRow[] = [];
  for (const [index, item] of (product.recipe?.items ?? []).entries()) {
    const netQuantity = typeof item.grossQuantity === "number" ? item.grossQuantity * multiplier : null;
    const ingredient = item.ingredientId ? await fetchProductDetail(item.ingredientId, cache, productById) : undefined;
    if (!ingredient) {
      rows.push(buildIngredientCostRow(item.name, "unknown", item.unit ?? "", netQuantity, depth, `${product.id}:${index}:unknown`));
      continue;
    }
    rows.push(buildOperationCostRow(ingredient, netQuantity, depth, `${product.id}:${ingredient.id}:${index}`));
    const batchVolume = ingredient.production?.batchVolume;
    if (ingredient.kind === "semifinished" && typeof netQuantity === "number" && typeof batchVolume === "number" && batchVolume > 0) {
      rows.push(...await buildRecipeCostRows(ingredient, netQuantity / batchVolume, depth + 1, cache, productById, nextTrail));
    }
  }
  return rows;
}

function buildIngredientCostRow(name: string, kind: ProductKind | "unknown", unit: string, netQuantity: number | null, depth: number, key: string): CostingRow {
  return { key, depth, name, kind, unit, netQuantity, batchVolume: null, batchTimeMinutes: null, hourlyRate: null, netTimeMinutes: null, netCost: null, normCost: null, kgCost: null };
}

function buildOperationCostRow(product: Product, netQuantity: number | null, depth: number, key: string): CostingRow {
  const batchVolume = product.production?.batchVolume ?? null;
  const batchTimeMinutes = product.production?.batchTimeMinutes ?? null;
  const hourlyRate = product.production?.hourlyRate ?? null;
  const netTimeMinutes = product.kind === "semifinished" && typeof netQuantity === "number" && typeof batchVolume === "number" && typeof batchTimeMinutes === "number" && batchVolume > 0 ? (netQuantity / batchVolume) * batchTimeMinutes : null;
  const netCost = typeof netTimeMinutes === "number" && typeof hourlyRate === "number" ? (netTimeMinutes / 60) * hourlyRate : null;
  const normCost = typeof batchTimeMinutes === "number" && typeof hourlyRate === "number" ? (batchTimeMinutes / 60) * hourlyRate : null;
  const kgCost = typeof normCost === "number" && typeof batchVolume === "number" && batchVolume > 0 ? normCost / batchVolume : null;
  return { key, depth, name: product.name, kind: product.kind, unit: product.measureUnit ?? product.production?.batchUnit ?? "", netQuantity, batchVolume, batchTimeMinutes, hourlyRate, netTimeMinutes, netCost, normCost, kgCost };
}

function summarizeCostRows(rows: CostingRow[]) {
  return rows.reduce((total, row) => ({ minutes: total.minutes + (row.netTimeMinutes ?? 0), cost: total.cost + (row.netCost ?? 0) }), { minutes: 0, cost: 0 });
}

function formatOptionalNumber(value: number | null | undefined) {
  return typeof value === "number" ? formatMoney(value) : "";
}

function formatRubles(value: number | null | undefined) {
  return typeof value === "number" ? `${formatMoney(value)} руб` : "";
}

function formatMinutes(value: number | null | undefined) {
  return typeof value === "number" ? `${formatMoney(value)} мин` : "";
}

function TestSheet({ items, onEdit }: { items: Product[]; onEdit: (product: Product) => void }) {
  const unknownPlace = "Неопределенные";
  const [openedPlace, setOpenedPlace] = useState<string | undefined>();
  const [hourPrice, setHourPrice] = useState("");
  const employeeHourPrice = parseOptionalNumber(hourPrice);
  const places = useMemo(() => {
    const groups = new Map<string, { place: string; count: number; completed: number; items: Product[] }>();
    for (const item of items) {
      const place = cookingPlaceLabel(item, unknownPlace);
      if (!calculatorProductionPlaceSet.has(place)) continue;
      const current = groups.get(place) ?? { place, count: 0, completed: 0, items: [] };
      current.count += 1;
      current.items.push(item);
      if (typeof item.production?.batchVolume === "number" && typeof item.production?.batchTimeMinutes === "number") current.completed += 1;
      groups.set(place, current);
    }
    return calculatorProductionPlaces.map((place) => groups.get(place)).filter((place): place is NonNullable<typeof place> => Boolean(place)).map((place) => ({ ...place, items: place.items.sort((a, b) => a.name.localeCompare(b.name, "ru")) }));
  }, [items]);

  return (
    <section className="panel calculator-sheet test-sheet">
      <div className="section-head list-head test-head">
        <div>
          <h2>Тест</h2>
          <p>Пробная вкладка для расчета времени приготовления заготовок. Двойное нажатие по заготовке откроет карточку.</p>
        </div>
        <label className="test-hour-price"><span>Цена 1 часа сотрудника</span><input value={hourPrice} onChange={(event) => setHourPrice(event.target.value)} inputMode="decimal" placeholder="0" /></label>
      </div>
      <div className="calculator-list">
        <div className="calculator-row calculator-head test-place-head"><strong>Тип места приготовления</strong><span>Позиций</span><span>Заполнено</span><span></span></div>
        {places.map((place) => {
          const isOpen = openedPlace === place.place;
          return (
            <div className="calculator-group" key={place.place}>
              <button className={isOpen ? "calculator-row calculator-place-row active" : "calculator-row calculator-place-row"} onClick={() => setOpenedPlace(isOpen ? undefined : place.place)} type="button"><strong>{place.place}</strong><span>{place.count}</span><span>{place.completed}</span><span></span></button>
              {isOpen ? <div className="calculator-name-list"><div className="test-name-row calculator-name-head"><strong>Заготовка</strong><span>Объем партии</span><span>Время партии</span><span>Время 1 кг</span><span>Стоимость 1 кг</span></div>{place.items.map((item) => <button className="test-name-row" key={item.id} onDoubleClick={(event) => { if (event.button === 0) onEdit(item); }} title="Открыть карточку двойным нажатием" type="button"><strong>{item.name}</strong><span>{formatBatchVolume(item)}</span><span>{formatBatchTime(item)}</span><span>{formatTimePerKg(item)}</span><span>{formatLaborCostPerKg(item, employeeHourPrice)}</span></button>)}</div> : null}
            </div>
          );
        })}
      </div>
      {places.length === 0 ? <div className="empty">Заготовки для тестового расчета пока не найдены.</div> : null}
    </section>
  );
}

function cookingPlaceLabel(item: Product, fallback: string) {
  const value = item.productionPlace?.trim();
  return value || fallback;
}

function formatBatchVolume(item: Product) {
  if (typeof item.production?.batchVolume !== "number") return "";
  const unit = item.production.batchUnit?.trim();
  return unit ? `${formatMoney(item.production.batchVolume)} ${unit}` : formatMoney(item.production.batchVolume);
}

function formatBatchTime(item: Product) {
  if (typeof item.production?.batchTimeMinutes !== "number") return "";
  return formatMoney(item.production.batchTimeMinutes);
}

function formatTimePerKg(item: Product) {
  const batchVolume = item.production?.batchVolume;
  const batchTimeMinutes = item.production?.batchTimeMinutes;
  if (typeof batchVolume !== "number" || typeof batchTimeMinutes !== "number" || batchVolume <= 0) return "";
  return formatMoney(batchTimeMinutes / batchVolume);
}

function scaledNetValue(row: InlineRecipeRow, multiplier: number) {
  const netQuantity = parseOptionalNumber(row.grossQuantity);
  if (typeof netQuantity !== "number") return null;
  return netQuantity * multiplier;
}

function formatScaledNet(row: InlineRecipeRow, multiplier: number) {
  const value = scaledNetValue(row, multiplier);
  return typeof value === "number" ? formatMoney(value) : "";
}

function nestedMultiplierFor(row: InlineRecipeRow, item: Product, multiplier: number) {
  const netQuantity = scaledNetValue(row, multiplier);
  const batchVolume = item.production?.batchVolume;
  if (typeof netQuantity !== "number" || typeof batchVolume !== "number" || batchVolume <= 0) return multiplier;
  return netQuantity / batchVolume;
}

function formatNetProductionTime(row: InlineRecipeRow, item: Product, multiplier = 1) {
  const netQuantity = scaledNetValue(row, multiplier);
  const batchVolume = item.production?.batchVolume;
  const batchTimeMinutes = item.production?.batchTimeMinutes;
  if (typeof netQuantity !== "number" || typeof batchVolume !== "number" || typeof batchTimeMinutes !== "number" || batchVolume <= 0) return "";
  return formatMoney((netQuantity / batchVolume) * batchTimeMinutes);
}

function formatLaborCostPerKg(item: Product, employeeHourPrice: number | null) {
  const batchVolume = item.production?.batchVolume;
  const batchTimeMinutes = item.production?.batchTimeMinutes;
  if (typeof employeeHourPrice !== "number" || typeof batchVolume !== "number" || typeof batchTimeMinutes !== "number" || batchVolume <= 0) return "";
  return formatMoney((batchTimeMinutes / batchVolume / 60) * employeeHourPrice);
}

function productionNormCost(item: Product) {
  const batchTimeMinutes = item.production?.batchTimeMinutes;
  const hourlyRate = item.production?.hourlyRate;
  if (typeof batchTimeMinutes !== "number" || typeof hourlyRate !== "number") return null;
  return (hourlyRate / 60) * batchTimeMinutes;
}

function formatProductionNormCost(item: Product) {
  const value = productionNormCost(item);
  return typeof value === "number" ? formatMoney(value) : "";
}

function formatProductionKgCost(item: Product) {
  const normCost = productionNormCost(item);
  const batchVolume = item.production?.batchVolume;
  if (typeof normCost !== "number" || typeof batchVolume !== "number" || batchVolume <= 0) return "";
  return formatMoney(normCost / batchVolume);
}

function formatNetProductionCost(row: InlineRecipeRow, item: Product, multiplier = 1) {
  const netQuantity = scaledNetValue(row, multiplier);
  const normCost = productionNormCost(item);
  const batchVolume = item.production?.batchVolume;
  if (typeof netQuantity !== "number" || typeof normCost !== "number" || typeof batchVolume !== "number" || batchVolume <= 0) return "";
  return formatMoney((normCost / batchVolume) * netQuantity);
}

function buildInlineRecipeDraft(items: RecipeIngredient[]): InlineRecipeRow[] {
  return items.map((item) => ({
    ingredientId: item.ingredientId,
    name: item.name,
    article: item.article,
    unit: item.unit ?? "",
    grossQuantity: numberToText(item.grossQuantity),
  }));
}

function numberToText(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function SalesSheet({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [filters, setFilters] = useState<SalesFilters>({ date: "", dish: "", category: "", department: "", amount: "", revenue: "" });
  const [dateFrom, setDateFrom] = useState(todayInputValue());
  const [dateTo, setDateTo] = useState(todayInputValue());
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const filteredRows = rows.filter((row) => matchesSalesFilters(row, filters));
  const revenue = filteredRows.reduce((sum, row) => sum + row.revenue, 0);
  const amount = filteredRows.reduce((sum, row) => sum + row.amount, 0);
  const grossProfit = filteredRows.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0);
  const avgPrice = amount ? revenue / amount : 0;
  const topConcepts = aggregateSales(filteredRows, (row) => row.concept ?? row.department ?? "Без концепции").slice(0, 6);
  const topCategories = aggregateSales(filteredRows, (row) => row.category ?? "Без категории").slice(0, 8);
  const topDishes = aggregateSales(filteredRows, (row) => row.dishName).slice(0, 12);

  useEffect(() => {
    void loadLocalSales();
  }, []);

  async function loadLocalSales() {
    setError("");
    try {
      const response = await fetch("/api/local/sales", { cache: "no-store" });
      const data = (await response.json()) as SalesResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось прочитать локальные продажи.");
        return;
      }
      setRows(data.items ?? []);
    } catch {
      setError("Не удалось прочитать локальные продажи.");
    }
  }

  async function syncSales() {
    setIsBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/iiko/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dateFrom, dateTo }) });
      const data = (await response.json()) as SalesResponse;
      if (!response.ok || !data.ok) {
        setError(data.error ?? "Не удалось загрузить продажи из iiko.");
        return;
      }
      setRows(data.items ?? []);
      setMessage("Продажи загружены. Строк: " + (data.sync?.saved ?? data.items?.length ?? 0) + ".");
    } catch {
      setError("Не удалось загрузить продажи из iiko.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="panel product-sheet">
      <div className="section-head list-head sales-head">
        <div>
          <h2>Продажи</h2>
          <p>Месячный отчет из Excel хранится локально в SQLite. Дальше на его базе строим аналитику и план.</p>
        </div>
        <div className="sales-actions">
          <label><span>С</span><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
          <label><span>По</span><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
          <button className="primary" disabled={isBusy || !isLoggedIn} onClick={() => void syncSales()} type="button">{isBusy ? "Загружаю..." : "Загрузить из iiko"}</button>
          <button className="secondary" disabled={isBusy} onClick={() => void loadLocalSales()} type="button">Открыть локальные</button>
        </div>
      </div>
      {message ? <div className="message app-message">{message}</div> : null}
      {error ? <div className="message error app-message">{error}</div> : null}
      <div className="sales-kpi-grid">
        <div><span>Выручка</span><strong>{formatMoney(revenue)}</strong></div>
        <div><span>Количество</span><strong>{formatMoney(amount)}</strong></div>
        <div><span>Средняя цена</span><strong>{formatMoney(avgPrice)}</strong></div>
        <div><span>Валовая прибыль</span><strong>{formatMoney(grossProfit)}</strong></div>
        <div><span>Строк</span><strong>{filteredRows.length} / {rows.length}</strong></div>
      </div>
      <div className="sales-analytics-grid">
        <SalesMiniTable title="Концепции" rows={topConcepts} />
        <SalesMiniTable title="Категории" rows={topCategories} />
        <SalesMiniTable title="Топ блюд" rows={topDishes} />
      </div>
      <div className="product-table-wrap">
        <table className="product-table sales-table detailed-sales-table">
          <thead><tr><th><div className="th-label">Период</div><input className="header-filter" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} placeholder="Фильтр" /></th><th><div className="th-label">Концепция</div><input className="header-filter" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} placeholder="Фильтр" /></th><th><div className="th-label">Категория</div><input className="header-filter" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} placeholder="Фильтр" /></th><th><div className="th-label">Группа</div></th><th><div className="th-label">Блюдо</div><input className="header-filter" value={filters.dish} onChange={(e) => setFilters({ ...filters, dish: e.target.value })} placeholder="Фильтр" /></th><th><div className="th-label">Кол-во</div><input className="header-filter" value={filters.amount} onChange={(e) => setFilters({ ...filters, amount: e.target.value })} placeholder="Фильтр" /></th><th><div className="th-label">Выручка</div><input className="header-filter" value={filters.revenue} onChange={(e) => setFilters({ ...filters, revenue: e.target.value })} placeholder="Фильтр" /></th><th><div className="th-label">Ср. цена</div></th><th><div className="th-label">Вал. прибыль</div></th><th><div className="th-label">Себест.</div></th></tr></thead>
          <tbody>{filteredRows.map((row) => <tr key={row.id}><td>{row.date ?? ""}</td><td>{row.concept ?? row.department ?? ""}</td><td>{row.category ?? ""}</td><td>{row.group ?? ""}</td><td>{row.dishName}</td><td>{formatMoney(row.amount)}</td><td>{formatMoney(row.revenue)}</td><td>{typeof row.avgPrice === "number" ? formatMoney(row.avgPrice) : ""}</td><td>{typeof row.grossProfit === "number" ? formatMoney(row.grossProfit) : ""}</td><td>{typeof row.costTotal === "number" ? formatMoney(row.costTotal) : ""}</td></tr>)}</tbody>
        </table>
      </div>
      {filteredRows.length === 0 ? <div className="empty">Продажи пока не загружены или не подходят под фильтры.</div> : null}
    </section>
  );
}

function SalesMiniTable({ title, rows }: { title: string; rows: Array<{ name: string; amount: number; revenue: number }> }) {
  return <div className="sales-mini-table"><h3>{title}</h3>{rows.map((row) => <div className="sales-mini-row" key={row.name}><strong>{row.name}</strong><span>{formatMoney(row.amount)}</span><span>{formatMoney(row.revenue)}</span></div>)}</div>;
}

function SyncSheet({ dbPath, isBusy, isLoggedIn, lastSync, serverUrl, setServerUrl, onLogout, onReload, onSync }: { dbPath: string; isBusy: boolean; isLoggedIn: boolean; lastSync?: LastSync; serverUrl: string; setServerUrl: (value: string) => void; onLogout: () => void; onReload: () => void; onSync: () => void }) {
  return <section className="sheet sync-sheet"><section className="panel sync-panel"><h2 className="panel-title">Синхронизация</h2><label className="field"><span>Адрес сервера iiko</span><input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} inputMode="url" /></label><div className="actions"><button className="primary" disabled={isBusy || !isLoggedIn} onClick={onSync} type="button">Скачать данные из iiko</button><button className="secondary" disabled={isBusy} onClick={onReload} type="button">Открыть локальную базу</button><button className="ghost" disabled={isBusy} onClick={onLogout} type="button">Выйти</button></div>{dbPath ? <p className="db-path">SQLite: {dbPath}</p> : null}<div className="sync-facts"><span>Последняя синхронизация: {lastSync ? formatDate(lastSync.finishedAt) : "нет"}</span><span>Позиции: {lastSync?.totalProducts ?? 0}</span><span>Рецепты: {lastSync?.totalRecipes ?? 0}</span></div></section></section>;
}

function CreateProductModal({ kind, sourceProducts, existingItems, onClose, onCreated }: { kind: ProductKind; sourceProducts: Product[]; existingItems: Product[]; onClose: () => void; onCreated: (product: Product) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [article, setArticle] = useState("");
  const [code, setCode] = useState("");
  const [measureUnit, setMeasureUnit] = useState(kind === "dish" ? "порц." : "");
  const [price, setPrice] = useState("");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(kind === "dish" ? [newIngredientRow()] : []);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const categories = useMemo(() => uniqueValues(existingItems.map((item) => item.group ?? item.category)), [existingItems]);
  const units = useMemo(() => uniqueValues(existingItems.map((item) => item.measureUnit)), [existingItems]);
  const ingredientMap = useMemo(() => new Map(sourceProducts.map((item) => [item.id, item])), [sourceProducts]);

  function updateIngredient(rowId: string, patch: Partial<IngredientDraft>) { setIngredients((current) => current.map((row) => row.rowId === rowId ? { ...row, ...patch } : row)); }
  function removeIngredient(rowId: string) { setIngredients((current) => current.filter((row) => row.rowId !== rowId)); }

  async function save() {
    setIsSaving(true);
    setError("");
    const preparedIngredients = ingredients.filter((row) => row.ingredientId).map((row) => {
      const ingredient = ingredientMap.get(row.ingredientId);
      return { ingredientId: row.ingredientId, grossQuantity: parseOptionalNumber(row.grossQuantity), unit: ingredient?.measureUnit ?? "" };
    });
    try {
      const response = await fetch("/api/local/products/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, name, category, article, code, measureUnit, price: parseOptionalNumber(price), ingredients: preparedIngredients }) });
      const data = (await response.json()) as { ok: boolean; error?: string; product?: Product };
      if (!response.ok || !data.ok || !data.product) {
        setError(data.error ?? "Не удалось сохранить позицию.");
        return;
      }
      onCreated(data.product);
    } catch {
      setError("Не удалось сохранить позицию.");
    } finally {
      setIsSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation"><section className="modal create-modal" role="dialog" aria-modal="true" aria-label="Создание позиции"><div className="modal-head"><div><h2>Добавить {createNoun(kind)}</h2><p>Новая позиция будет сохранена только в локальную SQLite.</p></div><button className="icon-button" onClick={onClose} type="button">×</button></div><div className="modal-grid"><label className="field"><span>Название</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label><label className="field"><span>Категория</span><input list="category-list" value={category} onChange={(e) => setCategory(e.target.value)} /></label><label className="field"><span>Артикул</span><input value={article} onChange={(e) => setArticle(e.target.value)} /></label><label className="field"><span>Код</span><input value={code} onChange={(e) => setCode(e.target.value)} /></label><label className="field"><span>Единица измерения</span><input list="unit-list" value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)} /></label><label className="field"><span>Цена</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></label></div><datalist id="category-list">{categories.map((item) => <option key={item} value={item} />)}</datalist><datalist id="unit-list">{units.map((item) => <option key={item} value={item} />)}</datalist>{kind === "dish" ? <div className="ingredients-block"><div className="ingredients-head"><h3>Состав блюда</h3><button className="secondary" onClick={() => setIngredients((current) => [...current, newIngredientRow()])} type="button">Добавить ингредиент</button></div><div className="ingredients-table"><div className="ingredients-row ingredients-title"><span>Ингредиент</span><span>Ед.</span><span>Нетто, кг</span><span></span></div>{ingredients.map((row) => { const ingredient = ingredientMap.get(row.ingredientId); return <div className="ingredients-row" key={row.rowId}><select value={row.ingredientId} onChange={(e) => updateIngredient(row.rowId, { ingredientId: e.target.value })}><option value="">Выберите товар или заготовку</option>{sourceProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={ingredient?.measureUnit ?? ""} readOnly /><input value={row.grossQuantity} onChange={(e) => updateIngredient(row.rowId, { grossQuantity: e.target.value })} inputMode="decimal" /><button className="small-button" onClick={() => removeIngredient(row.rowId)} type="button">Убрать</button></div>; })}</div></div> : null}{error ? <div className="message error">{error}</div> : null}<div className="modal-actions"><button className="secondary" onClick={onClose} type="button">Отмена</button><button className="primary" disabled={isSaving || !name.trim()} onClick={() => void save()} type="button">Сохранить в SQLite</button></div></section></div>;
}

function getSheetTitle(sheet: ActiveSheet) { if (sheet === "goods") return "Товары"; if (sheet === "semifinished") return "Заготовки"; if (sheet === "dishes") return "Блюда"; if (sheet === "sales") return "Продажи"; if (sheet === "calculator") return "Калькулятор"; if (sheet === "costing") return "Расчет"; if (sheet === "test") return "Тест"; if (sheet === "workshops") return "Цеха"; return "Синхронизация"; }
function sheetToKind(sheet: ActiveSheet): ProductKind { if (sheet === "semifinished") return "semifinished"; if (sheet === "dishes") return "dish"; return "other"; }
function createNoun(kind: ProductKind) { if (kind === "semifinished") return "заготовку"; if (kind === "dish") return "блюдо"; return "товар"; }
function buildCategories(items: Product[]) { const counts = new Map<string, { key: string; name: string; count: number }>(); for (const item of items) { const key = productCategoryKey(item); const name = item.group ?? item.category ?? "Без категории"; const current = counts.get(key) ?? { key, name, count: 0 }; current.count += 1; counts.set(key, current); } return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru")); }
function mergeCategories(current: { key: string; name: string; count: number }[], next: { key: string; name: string; count: number }[]) { const map = new Map(current.map((item) => [item.key, item])); for (const item of next) map.set(item.key, item); return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru")); }
function productCategoryKey(product: Product) { return product.groupId ?? product.categoryId ?? product.group ?? product.category ?? "uncategorized"; }
function matchesProductFilters(item: Product, filters: ProductFilters) { return includes(item.name, filters.name) && (filters.categories.length === 0 || filters.categories.includes(productCategoryKey(item))) && includes(item.article, filters.article) && includes(item.code, filters.code) && includes(item.measureUnit, filters.unit) && includes(typeof item.price === "number" ? String(item.price) : "", filters.price) && includes(numberToText(item.production?.batchVolume), filters.batchVolume) && includes(numberToText(item.production?.batchTimeMinutes), filters.batchTime) && includes(numberToText(item.production?.hourlyRate), filters.hourlyRate) && includes(formatProductionNormCost(item), filters.normCost) && includes(formatProductionKgCost(item), filters.kgCost); }
function matchesSalesFilters(item: SalesRow, filters: SalesFilters) { return includes(item.date, filters.date) && includes(item.dishName, filters.dish) && includes(item.category, filters.category) && includes(item.concept ?? item.department, filters.department) && includes(String(item.amount), filters.amount) && includes(String(item.revenue), filters.revenue); }
function aggregateSales(items: SalesRow[], getName: (row: SalesRow) => string) { const map = new Map<string, { name: string; amount: number; revenue: number }>(); for (const item of items) { const name = getName(item); const current = map.get(name) ?? { name, amount: 0, revenue: 0 }; current.amount += item.amount; current.revenue += item.revenue; map.set(name, current); } return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, "ru")); }
function includes(value: string | undefined, query: string) { return !query.trim() || (value ?? "").toLowerCase().includes(query.trim().toLowerCase()); }
function defaultProductColumns(kind: ProductKind) { return kind === "semifinished" || kind === "dish" ? productColumnOrder : baseProductColumnOrder; }
function moveKey<T>(items: T[], source: T, target: T) { const next = [...items]; const sourceIndex = next.indexOf(source); const targetIndex = next.indexOf(target); if (sourceIndex < 0 || targetIndex < 0) return items; const [removed] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, removed); return next; }
function uniqueValues(values: Array<string | undefined>) { return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ru")); }
function newIngredientRow(): IngredientDraft { return { rowId: String(Date.now()) + Math.random().toString(16).slice(2), ingredientId: "", grossQuantity: "" }; }
function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatMoney(value: number) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value); }
function parseOptionalNumber(value: string) { const normalized = value.trim().replace(",", "."); if (!normalized) return null; const number = Number(normalized); return Number.isFinite(number) ? number : null; }
function todayInputValue() { return new Date().toISOString().slice(0, 10); }
