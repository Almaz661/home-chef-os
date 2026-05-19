# Деплой ШефДома

## Главное изменение

С этого момента приложение хранит данные в **Neon PostgreSQL** (или любом
другом внешнем PostgreSQL), а **не в локальном SQLite-файле**. Это значит:

- ✅ Данные **переживают** деплои, перезапуски, миграции инстансов
- ✅ Free-план Render теперь полностью пригоден для постоянного использования
- ⚠️ Перед запуском **обязательно** установите `DATABASE_URL`
- ⚠️ Старые SQLite-файлы (`data/homechef.db`) больше не используются

## Шаг 0: получить DATABASE_URL из Neon

1. Зайдите на https://console.neon.tech
2. Выберите ваш проект (или создайте новый — Free план достаточен)
3. Connection Details → **«Pooled connection»**
4. Скопируйте строку вида:
   ```
   postgres://USER:PASSWORD@ep-XXXX-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

> Важно использовать **pooled** строку (через pgbouncer) — она лучше
> работает с эпизодическими подключениями Render Free.

## Render.com (рекомендуется)

1. https://dashboard.render.com/blueprints → **New Blueprint Instance**
2. Подключите репо `Almaz661/home-chef-os`
3. Render найдёт `render.yaml` и создаст веб-сервис.
   **Auto-deploy в render.yaml уже отключён** — это значит, что повторный
   пуш в репозиторий НЕ запустит автоматический передеплой.
4. После создания: ваш сервис → **Environment** → добавьте:
   - `DATABASE_URL` = строка из Neon (шаг 0)
   - (опционально) `OCR_SPACE_API_KEY`, `DEEPL_API_KEY` и т.д.
5. **Manual Deploy** → Deploy latest commit
6. Откройте URL вида `https://home-chef-os.onrender.com`. Войдите по PIN `1234`.

При первом запуске сервер сам выполнит миграции и сидинг
(пользователь + базовый каталог продуктов). **Рецепты сидом не
загружаются** — добавьте свои через UI («Импорт» или «Импорт раздела»).

## Fly.io (альтернатива)

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth signup
flyctl launch --no-deploy
flyctl secrets set DATABASE_URL='postgres://...?sslmode=require'
flyctl deploy
```

`fly.toml` уже настроен на работу с внешним PostgreSQL — persistent volume
больше не используется.

## Локальная разработка

```bash
cp .env.example .env
# отредактируйте .env, поставьте DATABASE_URL (можно тот же Neon или
# локальный postgres через docker)
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Локальный PostgreSQL для разработки:
```bash
docker run -d --name chefdom-pg \
  -e POSTGRES_PASSWORD=dev \
  -e POSTGRES_USER=dev \
  -e POSTGRES_DB=chefdom \
  -p 5432:5432 postgres:16

# .env:
# DATABASE_URL=postgres://dev:dev@localhost:5432/chefdom?sslmode=disable
```

## Импорт рецептов

После запуска приложения зайдите в **Рецепты** и используйте:

- **Импорт** — вставьте ссылку на один рецепт, получите один рецепт.
  Поддерживаются сайты с разметкой Schema.org (menunedeli.ru, povar.ru,
  iamcook.ru, eda.ru и большинство других).
- **Импорт раздела** — вставьте ссылку на категорию-каталог
  (например `https://menunedeli.ru/.../salaty/`), нажмите «Начать импорт».
  Сервер найдёт все ссылки на рецепты на странице (плюс пагинацию) и
  загрузит каждый по очереди — с фотографиями. В диалоге показывается
  прогресс: «Загружено X из Y», список добавленных рецептов и список ошибок.
  Можно прервать в любой момент — добавленные ранее рецепты сохранятся.
