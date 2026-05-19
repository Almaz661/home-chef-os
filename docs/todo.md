# ШефДом — TODO

## Wave 7 — PostgreSQL migration + bulk section import (текущий PR)

Этот PR — критический фикс главной проблемы: **на Render Free SQLite-файл
сбрасывался при каждом передеплое и пользователь терял свои рецепты**.

### Что сделано
- [x] Полный переход с `better-sqlite3` на `postgres-js` + `drizzle-orm/postgres-js`
- [x] `server/db/schema.ts` переписан на `pg-core` (timestamp/serial/boolean)
- [x] `server/db/migrate.ts` использует таблицу `schema_migrations` для версионирования и идемпотентного `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- [x] Все роутеры (auth, recipes, menu, shopping, inventory, products, cooking, receipts, currency) переписаны на async drizzle:
  - `.get()` → `.limit(1)` + деструктуризация массива
  - `.all()` → просто await drizzle query
  - `.run()` → await
  - `result.lastInsertRowid` → `.returning({ id: ... })`
  - `sql` `(datetime('now'))` → `sql` `now()`
  - `lower()` для регистронезависимого поиска / `ILIKE` где имеет смысл
  - `date('now', '+3 days')` → `to_char(current_date + interval '3 days', 'YYYY-MM-DD')`
- [x] `seed.ts` теперь async + сидит только пользователя и каталог продуктов (рецепты пользователь импортирует сам)
- [x] **Импорт раздела** — новая фича:
  - `server/services/sectionImport.ts` — фоновый job: парсит каталог-страницу, находит ссылки на рецепты + пагинацию, импортирует каждый по очереди
  - tRPC: `importSectionStart` / `importSectionStatus` / `importSectionList` / `importSectionCancel`
  - UI: `src/components/SectionImportDialog.tsx` — диалог с прогрессом, последними добавленными, ошибками; client-side polling каждые 1.5 сек
  - Кнопка «Импорт раздела» в `src/pages/RecipesPage.tsx` рядом с существующей «Импорт»
  - Старый одиночный «Импорт» работает как раньше — не сломан
- [x] `.env.example` / `DEPLOY.md` / `README.md` / `render.yaml` / `Dockerfile` / `fly.toml` обновлены под `DATABASE_URL`
- [x] `render.yaml`: `autoDeploy: false` — больше ни один пуш не запускает автоматический передеплой

### Что нужно сделать пользователю перед запуском
1. Получить connection string на https://console.neon.tech (Pooled)
2. На Render: Environment → `DATABASE_URL` = строка из шага 1
3. Manual Deploy
4. На странице «Рецепты» нажать «Импорт раздела», вставить ссылку на каталог (например `https://menunedeli.ru/.../salaty/`), дождаться окончания — все рецепты с фото будут в базе и **не пропадут** при следующем деплое

---

## Database & Schema (старый чек-лист, выполнен ранее)
- [x] MySQL/TiDB schema via Drizzle ORM: users (PIN auth), recipes, recipe_ingredients, recipe_steps, weekly_menus, menu_items, shopping_list, inventory, products
- [x] Run migrations via webdev_execute_sql

## Server (tRPC Routers)
- [x] PIN-based auth router (login with 4-digit PIN, session via JWT cookie)
- [x] Recipes router (CRUD, list, detail, ingredients, steps)
- [x] Menu router (weekly grid, add/remove meal slots, generate shopping list)
- [x] Shopping list router (CRUD, toggle checked, clear checked)
- [x] Inventory router (CRUD by location: fridge/freezer/pantry)
- [x] Products router (CRUD, search, categories)
- [x] Dashboard stats router (counts for recipes, shopping, inventory)

## Client Pages
- [x] Login / Dashboard / Recipes / Recipe detail / Add-edit / Menu / Shopping / Inventory / Products

## Design & UX
- [x] Warm orange + cream Tailwind 4 OKLCH, iPad-first, full Russian UI

## PWA
- [x] manifest.json + Service Worker

## QA Bug Fixes (Wave 6) — отложены
Wave 6 косметика отложена в пользу критического фикса БД. Большинство багов
из Wave 6 уже исправлены в коде до этого:
- [x] Dashboard photo thumbnails (уже работает: `r.imageUrl ? <img/> : <fallback/>`)
- [x] Recipe edit: description / prep time / cook time prefill (`setDescription`, `setPrepTime`, `setCookTime`)
- [x] Products: skeleton not present (нет `animate-pulse` в коде)
- [x] В покупки button on Menu page (`generateShoppingMutation` + navigate)
- [ ] [HIGH] Recipe edit: показывать существующее фото крупно (сейчас только мини-превью 80×80)
- [ ] [LOW] Dashboard: длинная категория обрезается во flex (нужно `min-w-0`/`truncate` или `flex-wrap`)
