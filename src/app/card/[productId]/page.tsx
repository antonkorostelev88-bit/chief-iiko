"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ProductKind = "semifinished" | "dish" | "other";

type RecipeIngredient = {
  ingredientId?: string;
  name: string;
  article?: string;
  unit?: string;
  grossQuantity?: number | null;
  netQuantity?: number | null;
};

type ProductRecipe = {
  source: "local" | "iiko";
  items: RecipeIngredient[];
  rawCount?: number;
};

type ProductDetail = {
  id: string;
  name: string;
  kind: ProductKind;
  type?: string | null;
  productionPlace?: string | null;
  category?: string | null;
  group?: string | null;
  article?: string | null;
  code?: string | null;
  price?: number | null;
  measureUnit?: string | null;
  production?: {
    operationName?: string | null;
    batchVolume?: number | null;
    batchUnit?: string | null;
    batchTimeMinutes?: number | null;
    yieldAmount?: number | null;
    yieldUnit?: string | null;
    laborMinutes?: number | null;
    hourlyRate?: number | null;
    recipeEffectiveFrom?: string | null;
    note?: string | null;
  } | null;
  recipe?: ProductRecipe | null;
};

type ProductOption = {
  id: string;
  name: string;
  kind: ProductKind;
  category?: string;
  group?: string;
  type?: string;
  productionPlace?: string;
  article?: string;
  code?: string;
  measureUnit?: string;
  price?: number;
};

type RecipeDraftRow = {
  rowId: string;
  ingredientId: string;
  ingredientLabel: string;
  unit: string;
  grossQuantity: string;
  netQuantity: string;
};

type WorkshopMapping = { productionPlace: string; workshop: string; position?: string; updatedAt?: string };
type WorkshopDefinition = { id: number; name: string; updatedAt?: string };

type CardTab = "info" | "production" | "recipe";

const TABS: Array<{ id: CardTab; label: string }> = [
  { id: "info", label: "Основные свойства" },
  { id: "production", label: "Информация" },
  { id: "recipe", label: "Рецепт" },
];

function numberOrEmpty(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function textOrEmpty(value: string | null | undefined) {
  return value ?? "";
}

export default function ProductCardWindowPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId;
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [catalog, setCatalog] = useState<ProductOption[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopDefinition[]>([]);
  const [workshopMappings, setWorkshopMappings] = useState<Record<string, WorkshopMapping>>({});
  const [activeTab, setActiveTab] = useState<CardTab>("info");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [productName, setProductName] = useState("");
  const [productKind, setProductKind] = useState<ProductKind>("other");
  const [article, setArticle] = useState("");
  const [productionPlace, setProductionPlace] = useState("");
  const [price, setPrice] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [category, setCategory] = useState("");
  const [operationName, setOperationName] = useState("");
  const [batchVolume, setBatchVolume] = useState("");
  const [batchUnit, setBatchUnit] = useState("");
  const [batchTimeMinutes, setBatchTimeMinutes] = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [yieldUnit, setYieldUnit] = useState("");
  const [laborMinutes, setLaborMinutes] = useState("");
  const [recipeEffectiveFrom, setRecipeEffectiveFrom] = useState("");
  const [note, setNote] = useState("");
  const [recipeRows, setRecipeRows] = useState<RecipeDraftRow[]>(() => ensureRecipeRows([]));

  const ingredientOptions = useMemo(
    () => catalog.filter((item) => item.kind === "other" || item.kind === "semifinished").sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [catalog],
  );
  const categoryOptions = useMemo(() => uniqueValues(catalog.map((item) => item.group ?? item.category).concat(product?.group ?? product?.category ?? "")), [catalog, product]);
  const articleOptions = useMemo(() => uniqueValues(catalog.map((item) => item.article).concat(product?.article ?? "")), [catalog, product]);
  const productionPlaceOptions = useMemo(() => uniqueValues(catalog.map((item) => item.productionPlace).concat(product?.productionPlace ?? productionPlace)), [catalog, product, productionPlace]);
  const priceOptions = useMemo(() => uniqueValues(catalog.map((item) => numberOrEmpty(item.price)).concat(price)), [catalog, price]);
  const workshopOptions = useMemo(() => uniqueValues(workshops.map((item) => item.name).concat(workshop)), [workshop, workshops]);
  const unitOptions = useMemo(
    () => uniqueValues(catalog.map((item) => item.measureUnit).concat(product?.measureUnit ?? "", product?.production?.batchUnit ?? "", product?.production?.yieldUnit ?? "", batchUnit, yieldUnit)),
    [batchUnit, catalog, product, yieldUnit],
  );

  const applyProduct = useCallback((nextProduct: ProductDetail, nextCatalog: ProductOption[]) => {
    const nextIngredients = nextCatalog.filter((item) => item.kind === "other" || item.kind === "semifinished");
    setProduct(nextProduct);
    setProductName(nextProduct.name);
    setProductKind(nextProduct.kind);
    setArticle(textOrEmpty(nextProduct.article));
    setProductionPlace(textOrEmpty(nextProduct.productionPlace));
    setPrice(numberOrEmpty(nextProduct.price));
    setCategory(textOrEmpty(nextProduct.group ?? nextProduct.category));
    setOperationName(textOrEmpty(nextProduct.production?.operationName));
    setBatchVolume(numberOrEmpty(nextProduct.production?.batchVolume));
    setBatchUnit(textOrEmpty(nextProduct.production?.batchUnit ?? nextProduct.measureUnit));
    setBatchTimeMinutes(numberOrEmpty(nextProduct.production?.batchTimeMinutes));
    setYieldAmount(numberOrEmpty(nextProduct.production?.yieldAmount));
    setYieldUnit(textOrEmpty(nextProduct.production?.yieldUnit ?? nextProduct.measureUnit));
    setLaborMinutes(numberOrEmpty(nextProduct.production?.laborMinutes));
    setRecipeEffectiveFrom(textOrEmpty(nextProduct.production?.recipeEffectiveFrom));
    setNote(textOrEmpty(nextProduct.production?.note) || technologyTemplate(nextProduct.kind));
    setRecipeRows(buildRecipeRows(nextProduct.recipe, nextIngredients));
  }, []);

  useEffect(() => {
    setWorkshop(textOrEmpty(workshopMappings[productionPlace]?.workshop));
  }, [productionPlace, workshopMappings]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [detailResponse, listResponse, mappingsResponse, workshopListResponse] = await Promise.all([
        fetch(`/api/local/products/detail?productId=${encodeURIComponent(productId)}`, { cache: "no-store" }),
        fetch("/api/local/products", { cache: "no-store" }),
        fetch("/api/local/workshops", { cache: "no-store" }),
        fetch("/api/local/workshop-list", { cache: "no-store" }),
      ]);
      const detailPayload = await detailResponse.json();
      const listPayload = await listResponse.json();
      const mappingsPayload = await mappingsResponse.json();
      const workshopListPayload = await workshopListResponse.json();
      if (!detailResponse.ok) throw new Error(detailPayload?.error ?? "Не удалось открыть карточку");
      if (!listResponse.ok) throw new Error(listPayload?.error ?? "Не удалось открыть справочники");
      const nextCatalog = (listPayload.items ?? []) as ProductOption[];
      setCatalog(nextCatalog);
      if (mappingsResponse.ok) setWorkshopMappings(Object.fromEntries(((mappingsPayload.items ?? []) as WorkshopMapping[]).map((item) => [item.productionPlace, item])));
      if (workshopListResponse.ok) setWorkshops((workshopListPayload.items ?? []) as WorkshopDefinition[]);
      applyProduct(detailPayload.product, nextCatalog);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Не удалось открыть карточку");
    }
  }, [applyProduct, productId]);

  useEffect(() => {
    if (productId) void load();
  }, [load, productId]);

  useEffect(() => {
    const shouldReload = (data: unknown) => {
      if (!data || typeof data !== "object") return false;
      const payload = data as { type?: string; productId?: string };
      return payload.type === "product-settings-saved" && (!payload.productId || payload.productId === productId);
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("iiko-chef-products") : undefined;
    const onChannelMessage = (event: MessageEvent) => {
      if (shouldReload(event.data)) void load();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "iiko-chef-products-updated" || !event.newValue) return;
      try {
        if (shouldReload(JSON.parse(event.newValue))) void load();
      } catch {
        // Ignore unrelated storage writes.
      }
    };
    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && shouldReload(event.data)) void load();
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
  }, [load, productId]);

  const save = async () => {
    if (!product) return;
    const selectedCategory = category.trim();
    if (selectedCategory && !categoryOptions.includes(selectedCategory)) {
      setActiveTab("info");
      setError("Выберите категорию из выпадающего списка.");
      return;
    }
    if (recipeRows.some((row) => row.ingredientLabel.trim() && !row.ingredientId)) {
      setActiveTab("recipe");
      setError("В рецепте выберите ингредиенты только из выпадающего списка товаров и заготовок.");
      return;
    }

    setIsBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/local/product-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          productName,
          kind: productKind,
          type: kindLabel(productKind),
          article,
          price: parseOptionalNumber(price),
          productionPlace,
          category: selectedCategory,
          operationName,
          batchVolume: parseOptionalNumber(batchVolume),
          batchUnit,
          batchTimeMinutes: parseOptionalNumber(batchTimeMinutes),
          yieldAmount: parseOptionalNumber(yieldAmount),
          yieldUnit,
          laborMinutes: parseOptionalNumber(laborMinutes),
          hourlyRate: product.production?.hourlyRate ?? null,
          recipeEffectiveFrom,
          note,
          recipeItems: recipeRows
            .filter((row) => row.ingredientId)
            .map((row) => ({ ingredientId: row.ingredientId, grossQuantity: parseOptionalNumber(row.grossQuantity), netQuantity: parseOptionalNumber(row.netQuantity), unit: row.unit })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось сохранить карточку");
      if (productionPlace.trim() && workshop.trim()) {
        await fetch("/api/local/workshops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productionPlace: productionPlace.trim(), workshop: workshop.trim(), position: workshopMappings[productionPlace]?.position }),
        }).catch(() => undefined);
      }
      applyProduct(payload.product, catalog);
      notifyProductSettingsChanged(product.id);
      setMessage("Карточка сохранена");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить карточку");
    } finally {
      setIsBusy(false);
    }
  };

  const content = useMemo(() => {
    if (!product) return null;

    if (activeTab === "info") {
      return (
        <MainPropertiesTab
          name={productName}
          kind={productKind}
          article={article}
          productionPlace={productionPlace}
          price={price}
          category={category}
          workshop={workshop}
          categories={categoryOptions}
          articles={articleOptions}
          productionPlaces={productionPlaceOptions}
          prices={priceOptions}
          workshops={workshopOptions}
          onName={setProductName}
          onKind={setProductKind}
          onArticle={setArticle}
          onProductionPlace={setProductionPlace}
          onPrice={setPrice}
          onCategory={setCategory}
          onWorkshop={setWorkshop}
        />
      );
    }

    if (activeTab === "production") {
      return (
        <ProductionTab
          operationName={operationName}
          batchVolume={batchVolume}
          batchUnit={batchUnit}
          batchTimeMinutes={batchTimeMinutes}
          laborMinutes={laborMinutes}
          yieldAmount={yieldAmount}
          yieldUnit={yieldUnit}
          units={unitOptions}
          onOperationName={setOperationName}
          onBatchVolume={setBatchVolume}
          onBatchUnit={setBatchUnit}
          onBatchTimeMinutes={setBatchTimeMinutes}
          onLaborMinutes={setLaborMinutes}
          onYieldAmount={setYieldAmount}
          onYieldUnit={setYieldUnit}
        />
      );
    }

    return <RecipeEditor kind={product.kind} rows={recipeRows} ingredients={ingredientOptions} note={note} units={unitOptions} yieldAmount={yieldAmount} yieldUnit={yieldUnit} effectiveFrom={recipeEffectiveFrom} onNote={setNote} onRows={setRecipeRows} onYieldAmount={setYieldAmount} onYieldUnit={setYieldUnit} onEffectiveFrom={setRecipeEffectiveFrom} />;
  }, [activeTab, article, articleOptions, batchTimeMinutes, batchUnit, batchVolume, category, categoryOptions, ingredientOptions, laborMinutes, note, operationName, price, priceOptions, product, productKind, productName, productionPlace, productionPlaceOptions, recipeEffectiveFrom, recipeRows, unitOptions, workshop, workshopOptions, yieldAmount, yieldUnit]);

  return (
    <main className="card-window-page">
      <section className="card-window-shell">
        <header className="card-window-head">
          <div>
            <h1>{product?.name ?? "Карточка"}</h1>
            {!product ? <p>Загружаю данные из SQLite</p> : null}
          </div>
          <button type="button" className="secondary-btn" onClick={() => window.close()}>
            Закрыть
          </button>
        </header>

        {error ? <div className="banner error">{error}</div> : null}
        {message ? <div className="banner success">{message}</div> : null}

        {product ? (
          <>
            <nav className="card-tabs" aria-label="Разделы карточки">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`card-tab${activeTab === tab.id ? " active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {content}

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={load} disabled={isBusy}>
                Обновить
              </button>
              <button type="button" className="primary-btn" onClick={save} disabled={isBusy}>
                {isBusy ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function MainPropertiesTab({
  name,
  kind,
  article,
  productionPlace,
  price,
  category,
  workshop,
  categories,
  articles,
  productionPlaces,
  prices,
  workshops,
  onName,
  onKind,
  onArticle,
  onProductionPlace,
  onPrice,
  onCategory,
  onWorkshop,
}: {
  name: string;
  kind: ProductKind;
  article: string;
  productionPlace: string;
  price: string;
  category: string;
  workshop: string;
  categories: string[];
  articles: string[];
  productionPlaces: string[];
  prices: string[];
  workshops: string[];
  onName: (value: string) => void;
  onKind: (value: ProductKind) => void;
  onArticle: (value: string) => void;
  onProductionPlace: (value: string) => void;
  onPrice: (value: string) => void;
  onCategory: (value: string) => void;
  onWorkshop: (value: string) => void;
}) {
  return (
    <section className="card-form" aria-label="Основные свойства">
      <EditableRow label="Название" value={name} onChange={onName} />
      <label className="card-row">
        <span>Тип номенклатуры</span>
        <select value={kind} onChange={(event) => onKind(event.target.value as ProductKind)}>
          <option value="dish">Блюдо</option>
          <option value="semifinished">Заготовка</option>
          <option value="other">Товар</option>
        </select>
      </label>
      <DatalistRow id="card-article-options" label="Артикул" value={article} values={articles} onChange={onArticle} />
      <DatalistRow id="card-place-options" label="Тип места приготовления" value={productionPlace} values={productionPlaces} onChange={onProductionPlace} />
      <DatalistRow id="card-price-options" label="Цена" value={price} values={prices} onChange={onPrice} inputMode="decimal" />
      <DatalistRow id="card-category-options" label="Категория" value={category} values={categories} onChange={onCategory} />
      <label className="card-row">
        <span>Цех</span>
        <select value={workshop} onChange={(event) => onWorkshop(event.target.value)}>
          <option value="">Не выбран</option>
          {workshops.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
    </section>
  );
}

function ProductionTab({
  operationName,
  batchVolume,
  batchUnit,
  batchTimeMinutes,
  laborMinutes,
  yieldAmount,
  yieldUnit,
  units,
  onOperationName,
  onBatchVolume,
  onBatchUnit,
  onBatchTimeMinutes,
  onLaborMinutes,
  onYieldAmount,
  onYieldUnit,
}: {
  operationName: string;
  batchVolume: string;
  batchUnit: string;
  batchTimeMinutes: string;
  laborMinutes: string;
  yieldAmount: string;
  yieldUnit: string;
  units: string[];
  onOperationName: (value: string) => void;
  onBatchVolume: (value: string) => void;
  onBatchUnit: (value: string) => void;
  onBatchTimeMinutes: (value: string) => void;
  onLaborMinutes: (value: string) => void;
  onYieldAmount: (value: string) => void;
  onYieldUnit: (value: string) => void;
}) {
  return (
    <section className="card-form" aria-label="Параметры партии">
      <EditableRow label="Операция" value={operationName} onChange={onOperationName} placeholder="Например: варка, нарезка, фасовка" />
      <EditableRow label="Объем партии" value={batchVolume} onChange={onBatchVolume} inputMode="decimal" />
      <label className="card-row">
        <span>Единица партии</span>
        <select value={batchUnit} onChange={(event) => onBatchUnit(event.target.value)}>
          <option value="">Выберите одно значение</option>
          {units.map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      </label>
      <EditableRow label="Активное время, мин" value={laborMinutes} onChange={onLaborMinutes} inputMode="numeric" />
      <EditableRow label="Сервисное время, мин" value={batchTimeMinutes} onChange={onBatchTimeMinutes} inputMode="numeric" />
      <label className="card-row card-row-split">
        <span>Выход</span>
        <div>
          <input value={yieldAmount} onChange={(event) => onYieldAmount(event.target.value)} inputMode="decimal" />
          <select value={yieldUnit} onChange={(event) => onYieldUnit(event.target.value)}>
            <option value="">Ед.</option>
            {units.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>
      </label>
    </section>
  );
}

function RecipeEditor({
  kind,
  rows,
  ingredients,
  note,
  units,
  yieldAmount,
  yieldUnit,
  effectiveFrom,
  onNote,
  onRows,
  onYieldAmount,
  onYieldUnit,
  onEffectiveFrom,
}: {
  kind: ProductKind;
  rows: RecipeDraftRow[];
  ingredients: ProductOption[];
  note: string;
  units: string[];
  yieldAmount: string;
  yieldUnit: string;
  effectiveFrom: string;
  onNote: (value: string) => void;
  onRows: (rows: RecipeDraftRow[]) => void;
  onYieldAmount: (value: string) => void;
  onYieldUnit: (value: string) => void;
  onEffectiveFrom: (value: string) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | undefined>();
  const [rowMenu, setRowMenu] = useState<{ rowId: string; x: number; y: number } | undefined>();
  const [actionsOpen, setActionsOpen] = useState(false);
  const labelMap = useMemo(() => new Map(ingredients.map((item) => [normalize(productOptionLabel(item)), item])), [ingredients]);
  const calculatedGross = useMemo(() => rows.reduce((sum, row) => sum + (parseOptionalNumber(row.grossQuantity) ?? 0), 0), [rows]);
  const calculatedNet = useMemo(() => rows.reduce((sum, row) => sum + (parseOptionalNumber(row.netQuantity) ?? 0), 0), [rows]);
  const template = technologyTemplate(kind);

  useEffect(() => {
    const close = () => setRowMenu(undefined);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  function updateRow(rowId: string, patch: Partial<RecipeDraftRow>) {
    onRows(ensureRecipeRows(rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))));
  }

  function updateIngredient(row: RecipeDraftRow, value: string) {
    const ingredient = labelMap.get(normalize(value));
    onRows(ensureRecipeRows(rows.map((current) => current.rowId === row.rowId ? {
      ...current,
      ingredientLabel: value,
      ingredientId: ingredient?.id ?? "",
      unit: ingredient?.measureUnit ?? "",
    } : current)));
  }

  function moveRow(targetRowId: string) {
    if (!draggedRowId || draggedRowId === targetRowId) return;
    onRows(ensureRecipeRows(moveRecipeRow(rows, draggedRowId, targetRowId)));
    setDraggedRowId(undefined);
  }

  function deleteRow(rowId: string) {
    onRows(ensureRecipeRows(rows.filter((row) => row.rowId !== rowId)));
    setRowMenu(undefined);
  }

  function createNewRecipe() {
    onRows(ensureRecipeRows([]));
    onEffectiveFrom(todayInputDate());
    onNote(technologyTemplate(kind));
    setActionsOpen(false);
  }

  function deleteRecipe() {
    onRows(ensureRecipeRows([]));
    onNote("");
    setActionsOpen(false);
  }

  return (
    <section className="recipe-editor">
      <div className="recipe-editor-head">
        <h2>Рецепт</h2>
        <div className="recipe-actions">
          <button type="button" className="secondary-btn" onClick={() => setActionsOpen((current) => !current)}>Действия</button>
          {actionsOpen ? (
            <div className="recipe-actions-menu">
              <button type="button" onClick={createNewRecipe}>Создать новую тех. карту</button>
              <button type="button" onClick={() => setActionsOpen(false)}>Редактировать тех. карту</button>
              <button type="button" className="danger-menu-button" onClick={deleteRecipe}>Удалить тех. карту</button>
              <button type="button" onClick={() => setActionsOpen(false)}>Произвести проработку</button>
            </div>
          ) : null}
        </div>
      </div>
      <datalist id="card-ingredient-options">
        {ingredients.map((item) => (
          <option key={item.id} value={productOptionLabel(item)} />
        ))}
      </datalist>
      <div className="recipe-edit-table">
        <div className="recipe-edit-row recipe-edit-head">
          <span>№</span>
          <span>Ингредиент</span>
          <span>Ед.</span>
          <span>Брутто</span>
          <span>Нетто</span>
        </div>
        {rows.map((row, index) => {
          const empty = isEmptyRecipeRow(row);
          return (
          <div
            className={["recipe-edit-row", draggedRowId === row.rowId ? "is-dragging" : "", empty ? "recipe-empty-row" : ""].filter(Boolean).join(" ")}
            draggable={!empty}
            key={row.rowId}
            onContextMenu={(event) => { event.preventDefault(); if (!empty) setRowMenu({ rowId: row.rowId, x: event.clientX, y: event.clientY }); }}
            onDragStart={() => { if (!empty) setDraggedRowId(row.rowId); }}
            onDragEnter={(event) => { event.preventDefault(); if (!empty) moveRow(row.rowId); }}
            onDragOver={(event) => event.preventDefault()}
            onDragEnd={() => setDraggedRowId(undefined)}
          >
            <span className="recipe-row-number">{empty ? "+" : index + 1}</span>
            <input list="card-ingredient-options" value={row.ingredientLabel} onChange={(event) => updateIngredient(row, event.target.value)} placeholder="Добавить ингредиент" />
            <input value={row.unit} readOnly />
            <input value={row.grossQuantity} onChange={(event) => updateRow(row.rowId, { grossQuantity: event.target.value })} inputMode="decimal" />
            <input value={row.netQuantity} onChange={(event) => updateRow(row.rowId, { netQuantity: event.target.value })} inputMode="decimal" />
          </div>
          );
        })}
      </div>
      <div className="recipe-sum-row">
        <strong>Сумма ингредиентов</strong>
        <span></span>
        <label><span>Брутто</span><input value={calculatedGross ? numberOrEmpty(calculatedGross) : ""} readOnly /></label>
        <label><span>Нетто</span><input value={calculatedNet ? numberOrEmpty(calculatedNet) : ""} readOnly /></label>
      </div>
      <div className="recipe-yield-row">
        <strong className="recipe-yield-title">Выход</strong>
        <span></span>
        <label><span>Выход</span><input value={yieldAmount ? `${yieldAmount} ${yieldUnit}`.trim() : ""} readOnly /></label>
        <label><span>Выход по ингредиентам</span><input value={calculatedGross ? numberOrEmpty(calculatedGross) : ""} readOnly /></label>
      </div>
      <label className="recipe-technology">
        <span>Технология</span>
        <textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder={template} />
      </label>
      <div className="recipe-version-row">
        <label>
          <span>Действует с</span>
          <input value={effectiveFrom} onChange={(event) => onEffectiveFrom(event.target.value)} type="date" />
        </label>
      </div>
      {rowMenu ? <div className="row-context-menu recipe-row-context-menu" style={{ left: rowMenu.x, top: rowMenu.y }} onClick={(event) => event.stopPropagation()}><button className="danger-menu-button" onClick={() => deleteRow(rowMenu.rowId)} type="button">Удалить строку</button></div> : null}
    </section>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <label className="card-row">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}

function DatalistRow({
  id,
  label,
  value,
  values,
  onChange,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <>
      <label className="card-row">
        <span>{label}</span>
        <input list={id} value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} />
      </label>
      <datalist id={id}>
        {values.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </>
  );
}

function EditableRow({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <label className="card-row">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </label>
  );
}

function buildRecipeRows(recipe: ProductRecipe | null | undefined, ingredients: ProductOption[]) {
  const rows = (recipe?.items ?? []).map((item) => {
    const ingredient = findIngredient(item, ingredients);
    return {
      rowId: newRowId(),
      ingredientId: ingredient?.id ?? item.ingredientId ?? "",
      ingredientLabel: ingredient ? productOptionLabel(ingredient) : item.name,
      unit: item.unit ?? ingredient?.measureUnit ?? "",
      grossQuantity: numberOrEmpty(item.grossQuantity),
      netQuantity: numberOrEmpty(item.netQuantity),
    };
  });
  return ensureRecipeRows(rows);
}

function ensureRecipeRows(rows: RecipeDraftRow[]) {
  const filledRows = rows.filter((row) => !isEmptyRecipeRow(row));
  return [...filledRows, newRecipeRow()];
}

function isEmptyRecipeRow(row: RecipeDraftRow) {
  return !row.ingredientId && !row.ingredientLabel.trim() && !row.unit.trim() && !row.grossQuantity.trim() && !row.netQuantity.trim();
}

function moveRecipeRow(rows: RecipeDraftRow[], draggedRowId: string, targetRowId: string) {
  const next = [...rows];
  const fromIndex = next.findIndex((row) => row.rowId === draggedRowId);
  const toIndex = next.findIndex((row) => row.rowId === targetRowId);
  if (fromIndex < 0 || toIndex < 0) return rows;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function newRecipeRow(): RecipeDraftRow {
  return { rowId: newRowId(), ingredientId: "", ingredientLabel: "", unit: "", grossQuantity: "", netQuantity: "" };
}

function newRowId() {
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

function findIngredient(item: RecipeIngredient, ingredients: ProductOption[]) {
  return ingredients.find((ingredient) => ingredient.id === item.ingredientId) ?? ingredients.find((ingredient) => ingredient.name === item.name && (!item.article || ingredient.article === item.article));
}

function productOptionLabel(item: ProductOption) {
  const parts = [item.article ? `арт. ${item.article}` : null, item.code ? `код ${item.code}` : null].filter(Boolean).join(", ");
  return parts ? `${item.name} (${parts})` : item.name;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ru"));
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function kindLabel(kind: ProductKind) {
  if (kind === "dish") return "Блюдо";
  if (kind === "semifinished") return "Заготовка";
  return "Товар";
}

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function technologyTemplate(kind: ProductKind) {
  if (kind === "semifinished") {
    return "1. Подготовка:\n\n2. Гастроемкость:\n\n3. Метод и срок хранения:";
  }

  if (kind === "dish") {
    return "1. Подготовка:\n\n2. Посуда:\n\n3. Выкладка:";
  }

  return "1. Подготовка:\n\n2. Посуда или хранение:\n\n3. Выкладка или срок хранения:";
}

function notifyProductSettingsChanged(productId: string) {
  const payload = { type: "product-settings-saved", productId, savedAt: Date.now() };

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("iiko-chef-products");
    channel.postMessage(payload);
    channel.close();
  }

  window.opener?.postMessage(payload, window.location.origin);
  window.localStorage.setItem("iiko-chef-products-updated", JSON.stringify(payload));
}
