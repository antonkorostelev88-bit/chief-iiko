"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  type?: string;
  code?: string;
  measureUnit?: string;
};

type ProductsResponse = {
  ok: boolean;
  error?: string;
  items?: Product[];
  totalFound?: number;
  filtered?: boolean;
};

const defaultServerUrl = "https://koza-dereza-izmailovskii.iiko.it/resto";

export default function Home() {
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [filtered, setFiltered] = useState(false);
  const [message, setMessage] = useState("Введите данные пользователя iiko.");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const statusText = useMemo(() => {
    if (isBusy) {
      return "Проверка";
    }

    return isLoggedIn ? "Сессия активна" : "Нет сессии";
  }, [isBusy, isLoggedIn]);

  async function loadProducts() {
    setIsBusy(true);
    setError("");

    try {
      const response = await fetch("/api/iiko/semifinished", { cache: "no-store" });
      const data = (await response.json()) as ProductsResponse;

      if (!response.ok || !data.ok) {
        setIsLoggedIn(false);
        setItems([]);
        setTotalFound(0);
        setFiltered(false);
        setMessage(data.error ?? "Нужно войти в iiko.");
        return;
      }

      setIsLoggedIn(true);
      setItems(data.items ?? []);
      setTotalFound(data.totalFound ?? 0);
      setFiltered(Boolean(data.filtered));
      setMessage(
        data.filtered
          ? "Полуфабрикаты получены из iiko."
          : "Полуфабрикаты по названию/типу не найдены, показаны первые позиции номенклатуры.",
      );
    } catch {
      setError("Не удалось связаться с приложением. Проверьте, что сервер запущен.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError("");
    setMessage("Входим в iiko...");

    try {
      const response = await fetch("/api/iiko/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, login, password }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setIsLoggedIn(false);
        setError(data.error ?? "iiko не принял данные входа.");
        return;
      }

      setPassword("");
      setIsLoggedIn(true);
      setMessage("Сессия создана. Загружаю полуфабрикаты...");
      await loadProducts();
    } catch {
      setError("Не удалось выполнить вход. Проверьте адрес сервера.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    setIsBusy(true);
    setError("");

    try {
      await fetch("/api/iiko/logout", { method: "POST" });
      setIsLoggedIn(false);
      setItems([]);
      setTotalFound(0);
      setFiltered(false);
      setMessage("Сессия закрыта.");
    } catch {
      setError("Не удалось закрыть сессию.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div>
            <h1 className="title">iiko Chef MVP</h1>
            <p className="subtitle">
              Тестовый вход в iiko и первичный вывод полуфабрикатов без сохранения.
            </p>
          </div>
          <div className="status">
            <strong>{statusText}</strong>
            <span>{serverUrl}</span>
          </div>
        </header>

        <div className="grid">
          <section className="panel login-panel">
            <h2 className="panel-title">Доступ к iiko</h2>
            <form onSubmit={handleLogin}>
              <label className="field">
                <span>Адрес сервера</span>
                <input
                  value={serverUrl}
                  onChange={(event) => setServerUrl(event.target.value)}
                  placeholder={defaultServerUrl}
                  inputMode="url"
                  autoComplete="url"
                />
              </label>
              <label className="field">
                <span>Логин</span>
                <input
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  autoComplete="username"
                />
              </label>
              <label className="field">
                <span>Пароль</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                />
              </label>

              <div className="actions">
                <button className="primary" disabled={isBusy} type="submit">
                  Войти и загрузить
                </button>
                <button
                  className="secondary"
                  disabled={isBusy || !isLoggedIn}
                  onClick={() => void loadProducts()}
                  type="button"
                >
                  Обновить
                </button>
                <button
                  className="ghost"
                  disabled={isBusy || !isLoggedIn}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  Выйти
                </button>
              </div>
            </form>

            <p className="hint">
              Пароль не показывается в интерфейсе и не сохраняется в базе. Для работы
              нужен отдельный пользователь iiko с доступом к API.
            </p>
            {message ? <div className="message">{message}</div> : null}
            {error ? <div className="message error">{error}</div> : null}
          </section>

          <section className="panel data-panel">
            <div className="data-head">
              <h2>{filtered ? "Полуфабрикаты" : "Номенклатура"}</h2>
              <span className="counter">
                Показано {items.length} из {totalFound}
              </span>
            </div>

            {items.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Тип</th>
                      <th>Код</th>
                      <th>Ед.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.type ?? ""}</td>
                        <td>{item.code ?? ""}</td>
                        <td>{item.measureUnit ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                После входа здесь появится список полуфабрикатов из iiko.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
