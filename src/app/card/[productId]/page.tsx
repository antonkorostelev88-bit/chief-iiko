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
  article?: string;
  code?: string;
  measureUnit?: string;
};

type RecipeDraftRow = {
  rowId: string;
  ingredientId: string;
  ingredientLabel: string;
  unit: string;
  grossQuantity: string;
};

type CardTab = "info" | "production" | "recipe";

const TABS: Array<{ id: CardTab; label: string }> = [
  { id: "info", label: "Информация" },
  { id: "production", label: "Партия" },
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
  const [activeTab, setActiveTab] = useState<CardTab>("info");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [category, setCategory] = useState("");
  const [operationName, setOperationName] = useState("");
  const [batchVolume, setBatchVolume] = useState("");
  const [batchUnit, setBatchUnit] = useState("");
  const [batchTimeMinutes, setBatchTimeMinutes] = useState("");
  const [yieldAmount, setYieldAmount] = useState("");
  const [yieldUnit, setYieldUnit] = useState("");
  const [laborMinutes, setLaborMinutes] = useState("");
  const [note, setNote] = useState("");
  const [recipeRows, setRecipeRows] = useState<RecipeDraftRow[]>(() => ensureRecipeRows([]));

  const ingredientOptions = useMemo(
    () => catalog.filter((item) => item.kind === "other" || item.kind === "semifinished").sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [catalog],
  );
  const categoryOptions = useMemo(() => uniqueValues(catalog.map((item) => item.group ?? item.category).concat(product?.group ?? product?.category ?? "")), [catalog, product]);
  const unitOptions = useMemo(
    () => uniqueValues(catalog.map((item) => item.measureUnit).concat(product?.measureUnit ?? "", product?.production?.batchUnit ?? "", batchUnit)),
    [batchUnit, catalog, product],
  );

  const applyProduct = useCallback((nextProduct: ProductDetail, nextCatalog: ProductOption[]) => {
    const nextIngredients = nextCatalog.filter((item) => item.kind === "other" || item.kind === "semifinished");
    setProduct(nextProduct);
    setCategory(textOrEmpty(nextProduct.group ?? nextProduct.category));
    setOperationName(textOrEmpty(nextProduct.production?.operationName));
    setBatchVolume(numberOrEmpty(nextProduct.production?.batchVolume));
    setBatchUnit(textOrEmpty(nextProduct.production?.batchUnit ?? nextProduct.measureUnit));
    setBatchTimeMinutes(numberOrEmpty(nextProduct.production?.batchTimeMinutes));
    setYieldAmount(numberOrEmpty(nextProduct.production?.yieldAmount));
    setYieldUnit(textOrEmpty(nextProduct.production?.yieldUnit ?? nextProduct.measureUnit));
    setLaborMinutes(numberOrEmpty(nextProduct.production?.laborMinutes));
    setNote(textOrEmpty(nextProduct.production?.note) || technologyTemplate(nextProduct.kind));
    setRecipeRows(buildRecipeRows(nextProduct.recipe, nextIngredients));
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const [detailResponse, listResponse] = await Promise.all([
        fetch(`/api/local/products/detail?productId=${encodeURIComponent(productId)}`, { cache: "no-store" }),
        fetch("/api/local/products", { cache: "no-store" }),
      ]);
      const detailPayload = await detailResponse.json();
      const listPayload = await listResponse.json();
      if (!detailResponse.ok) throw new Error(detailPayload?.error ?? "Не удалось открыть карточку");
      if (!listResponse.ok) throw new Error(listPayload?.error ?? "Не удалось открыть справочники");
      const nextCatalog = (listPayload.items ?? []) as ProductOption[];
      setCatalog(nextCatalog);
      applyProduct(detailPayload.product, nextCatalog);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Не удалось открыть карточку");
    }
  }, [applyProduct, productId]);

  useEffect(() => {
    if (productId) void load();
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
          category: selectedCategory,
          operationName,
          batchVolume: parseOptionalNumber(batchVolume),
          batchUnit,
          batchTimeMinutes: parseOptionalNumber(batchTimeMinutes),
          yieldAmount: parseOptionalNumber(yieldAmount),
          yieldUnit,
          laborMinutes: parseOptionalNumber(laborMinutes),
          hourlyRate: product.production?.hourlyRate ?? null,
          note,
          recipeItems: recipeRows
            .filter((row) => row.ingredientId)
            .map((row) => ({ ingredientId: row.ingredientId, grossQuantity: parseOptionalNumber(row.grossQuantity), unit: row.unit })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось сохранить карточку");
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
      return <InfoTab product={product} category={category} categories={categoryOptions} onCategory={setCategory} />;
    }

    if (activeTab === "production") {
      return (
        <ProductionTab
          operationName={operationName}
          batchVolume={batchVolume}
          batchUnit={batchUnit}
          batchTimeMinutes={batchTimeMinutes}
          units={unitOptions}
          onOperationName={setOperationName}
          onBatchVolume={setBatchVolume}
          onBatchUnit={setBatchUnit}
          onBatchTimeMinutes={setBatchTimeMinutes}
        />
      );
    }

    return <RecipeEditor kind={product.kind} rows={recipeRows} ingredients={ingredientOptions} note={note} units={unitOptions} yieldAmount={yieldAmount} yieldUnit={yieldUnit} onNote={setNote} onRows={setRecipeRows} onYieldAmount={setYieldAmount} onYieldUnit={setYieldUnit} />;
  }, [activeTab, batchTimeMinutes, batchUnit, batchVolume, category, categoryOptions, ingredientOptions, note, operationName, product, recipeRows, unitOptions, yieldAmount, yieldUnit]);

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

function InfoTab({ product, category, categories, onCategory }: { product: ProductDetail; category: string; categories: string[]; onCategory: (value: string) => void }) {
  return (
    <section className="card-form" aria-label="Информация из iiko">
      <label className="card-row">
        <span>Категория</span>
        <input list="card-category-options" value={category} onChange={(event) => onCategory(event.target.value)} placeholder="Начните вводить категорию" />
      </label>
      <datalist id="card-category-options">
        {categories.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <ReadOnlyRow label="Артикул" value={product.article ?? "Не указан"} />
      <ReadOnlyRow label="Код" value={product.code ?? "Не указан"} />
      <ReadOnlyRow label="Цена" value={product.price === null || product.price === undefined ? "Не указана" : product.price.toLocaleString("ru-RU")} />
    </section>
  );
}

function ProductionTab({
  operationName,
  batchVolume,
  batchUnit,
  batchTimeMinutes,
  units,
  onOperationName,
  onBatchVolume,
  onBatchUnit,
  onBatchTimeMinutes,
}: {
  operationName: string;
  batchVolume: string;
  batchUnit: string;
  batchTimeMinutes: string;
  units: string[];
  onOperationName: (value: string) => void;
  onBatchVolume: (value: string) => void;
  onBatchUnit: (value: string) => void;
  onBatchTimeMinutes: (value: string) => void;
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
      <EditableRow label="Время партии, мин" value={batchTimeMinutes} onChange={onBatchTimeMinutes} inputMode="numeric" />
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
  onNote,
  onRows,
  onYieldAmount,
  onYieldUnit,
}: {
  kind: ProductKind;
  rows: RecipeDraftRow[];
  ingredients: ProductOption[];
  note: string;
  units: string[];
  yieldAmount: string;
  yieldUnit: string;
  onNote: (value: string) => void;
  onRows: (rows: RecipeDraftRow[]) => void;
  onYieldAmount: (value: string) => void;
  onYieldUnit: (value: string) => void;
}) {
  const [draggedRowId, setDraggedRowId] = useState<string | undefined>();
  const [rowMenu, setRowMenu] = useState<{ rowId: string; x: number; y: number } | undefined>();
  const labelMap = useMemo(() => new Map(ingredients.map((item) => [normalize(productOptionLabel(item)), item])), [ingredients]);
  const calculatedYield = useMemo(() => rows.reduce((sum, row) => sum + (parseOptionalNumber(row.grossQuantity) ?? 0), 0), [rows]);
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

  return (
    <section className="recipe-editor">
      <div className="recipe-editor-head">
        <h2>Рецепт</h2>
      </div>
      <label className="recipe-technology">
        <span>Технология</span>
        <textarea value={note} onChange={(event) => onNote(event.target.value)} placeholder={template} />
      </label>
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
          </div>
          );
        })}
      </div>
      <div className="recipe-yield-row">
        <strong className="recipe-yield-title">Выход</strong>
        <span></span>
        <label className="recipe-yield-manual"><span>Выход вручную</span><input value={yieldAmount} onChange={(event) => onYieldAmount(event.target.value)} inputMode="decimal" /><select value={yieldUnit} onChange={(event) => onYieldUnit(event.target.value)}><option value="">Ед.</option>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
        <label><span>Выход по ингредиентам</span><input value={calculatedYield ? numberOrEmpty(calculatedYield) : ""} readOnly /></label>
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
    };
  });
  return ensureRecipeRows(rows);
}

function ensureRecipeRows(rows: RecipeDraftRow[]) {
  const filledRows = rows.filter((row) => !isEmptyRecipeRow(row));
  return [...filledRows, newRecipeRow()];
}

function isEmptyRecipeRow(row: RecipeDraftRow) {
  return !row.ingredientId && !row.ingredientLabel.trim() && !row.unit.trim() && !row.grossQuantity.trim();
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
  return { rowId: newRowId(), ingredientId: "", ingredientLabel: "", unit: "", grossQuantity: "" };
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
