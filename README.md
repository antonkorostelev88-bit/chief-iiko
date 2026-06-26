# iiko Chef MVP

Минимальное локальное веб-приложение для проверки подключения к iikoServer API.

## Что умеет

- ввод адреса iikoServer, логина и пароля;
- создание iiko API-сессии через `/resto/api/auth`;
- загрузка номенклатуры через `/resto/api/v2/entities/products/list`;
- пробный вывод полуфабрикатов/заготовок;
- logout через `/resto/api/logout`.

Пароли не сохраняются в базе и не коммитятся. Локальные файлы `.env*.local` исключены из Git.

## Запуск

```bat
npm.cmd install
npm.cmd run dev
```

Или двойной клик по `start-app.cmd`.

Приложение откроется на:

```txt
http://127.0.0.1:3000
```

Адрес iiko по умолчанию:

```txt
https://koza-dereza-izmailovskii.iiko.it/resto
```
