# ШефДом

Приложение для управления домашней кухней: рецепты, меню недели, список покупок, инвентарь, справочник продуктов, **сканер чеков** (NL → RU + EUR → RUB).

Стек: React 18 + Vite + tRPC + Drizzle ORM + **PostgreSQL (Neon)** + Express.

> 💾 С версии 2.0 данные хранятся в PostgreSQL (Neon), а не в локальном
> SQLite-файле. Это значит, что **рецепты переживают деплои** — больше
> ничего не теряется при пересборке/перезапуске.

---

## 🚀 Развернуть

См. [DEPLOY.md](./DEPLOY.md) — там пошаговая инструкция для Render и Fly.io.

Кратко:
1. Создайте проект на https://console.neon.tech (Free, без карты)
2. Скопируйте «Pooled connection» строку
3. Разверните на Render по `render.yaml`
4. В Environment добавьте `DATABASE_URL` со скопированной строкой
5. Manual Deploy → готово

---

## Быстрый старт (локально)

Требования: Node.js 20 или 22 + PostgreSQL (Neon или локальный docker).

```bash
cp .env.example .env
# отредактируйте .env, поставьте DATABASE_URL
npm install
npm run db:seed   # применит миграции и заполнит начальный каталог продуктов
npm run dev       # фронт на http://localhost:5173, API на http://localhost:3000
```

PIN по умолчанию: **1234**.

Локальный PostgreSQL для разработки:
```bash
docker run -d --name chefdom-pg \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=dev -e POSTGRES_DB=chefdom \
  -p 5432:5432 postgres:16

# .env:
# DATABASE_URL=postgres://dev:dev@localhost:5432/chefdom?sslmode=disable
```

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Параллельно поднимает Vite (фронт) и Express (API) с hot-reload |
| `npm run build` | Собирает фронт в `dist/` |
| `npm start` | Сборка + запуск прод-сервера (фронт раздаётся Express) |
| `npm run db:migrate` | Применяет схему PostgreSQL (идемпотентно) |
| `npm run db:seed` | Применяет схему и сидит начальный каталог продуктов |
| `npm run typecheck` | Проверяет типы фронта и сервера |
| `npm test` | Запускает unit-тесты |

## Импорт рецептов

В разделе «Рецепты» три способа добавления:

- **Добавить** — заполнить форму вручную
- **Импорт** — вставить ссылку на один рецепт (Schema.org / microdata)
- **Импорт раздела** — вставить ссылку на категорию-каталог
  (`https://menunedeli.ru/.../salaty/`); сервер сам найдёт все рецепты,
  включая пагинацию, и загрузит каждый по очереди с фотографиями. В
  диалоге показывается прогресс и можно прервать.

## Структура

```
home-chef-os/
├── src/                # Фронт (React)
│   ├── pages/
│   ├── components/
│   └── utils/trpc.ts
├── server/             # Backend (Express + tRPC)
│   ├── index.ts
│   ├── trpc.ts
│   ├── routers/
│   ├── services/
│   │   ├── recipeScraper.ts   # одиночный импорт
│   │   └── sectionImport.ts   # массовый импорт раздела
│   └── db/             # schema, migrate, seed (PostgreSQL)
├── public/
└── docs/
```

## Дорожная карта

Этот PR — **этап 0**: проект приведён в рабочее состояние из двух несовместимых
половин (Manus WebDev). На этой основе будут реализованы:

- **Этап 1**: автоматическая генерация списка покупок из меню с учётом инвентаря
  (вычитание остатков); закрытие багов QA Wave 6.
- **Этап 2**: сканирование чеков (OCR), переводчик голландский → русский,
  конвертация EUR → RUB.
- **Этап 3**: PWA-полировка, тесты основных сценариев, документация.

См. `docs/todo.md` для более детального чек-листа.

## Деплой

В одну строчку с любого хостинга, поддерживающего Node:

```bash
npm install && npm run build && npm start
```

Перед стартом будут автоматически применены миграции и сидинг (если БД пустая).
