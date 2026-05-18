# Деплой ШефДома

## Что выбрать

| Платформа | Бесплатно? | Persistent БД? | Сложность | Когда выбирать |
|---|---|---|---|---|
| **Render.com Free** | да, без карты | ❌ (БД пропадает) | очень просто | посмотреть как работает, для демо |
| **Render.com Starter** | $7/мес | ✅ | очень просто | реальное использование, не хочется возиться |
| **Fly.io Free** | да, нужна карта | ✅ (3GB volume) | средне | реальное использование без месячной платы |
| **Свой VPS / домашний сервер** | зависит | ✅ | сложно | если у вас уже есть |

> **Рекомендация:** начните с **Render Free** — деплоится за 5 минут одной кнопкой,
> чтобы убедиться что всё работает. Потом — Fly.io для постоянной работы.

---

## Вариант 1: Render.com Free (5 минут)

1. Зарегистрируйтесь на https://render.com (через GitHub — быстрее всего)
2. Откройте https://dashboard.render.com/blueprints
3. Нажмите **New Blueprint Instance**
4. Выберите репозиторий `Almaz661/home-chef-os`
5. Render автоматически найдёт `render.yaml` и создаст веб-сервис
6. Подождите 3–5 минут, пока пройдёт первый билд
7. Откройте URL вида `https://home-chef-os.onrender.com`
8. Войдите по PIN **1234**

**Минусы Free:** инстанс засыпает через 15 минут простоя (первый запрос
после засыпания — 30–60 секунд), и **БД сбрасывается при каждом засыпании**.
Подходит для теста. Для реальных данных — Starter ($7/мес) или Fly.io.

### Включить OCR/перевод/реальный курс

После деплоя в Render Dashboard → ваш сервис → **Environment**:

| Переменная | Где взять | Что даёт |
|---|---|---|
| `OCR_SPACE_API_KEY` | https://ocr.space/ocrapi (раздел "Free API key") | Сканирование чеков (25 000/мес) |
| `DEEPL_API_KEY` | https://www.deepl.com/pro-api → "DeepL API Free" | Перевод NL → RU (500 000 символов/мес) |

После добавления нажмите **Save Changes** — Render сам передеплоит.

---

## Вариант 2: Fly.io (постоянная БД, бесплатно)

1. Установите CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```
2. Зарегистрируйтесь:
   ```bash
   flyctl auth signup
   ```
3. В корне проекта:
   ```bash
   flyctl launch --copy-config --no-deploy
   flyctl volumes create homechef_data --region ams --size 1
   flyctl deploy
   ```
4. (Опционально) добавьте ключи:
   ```bash
   flyctl secrets set OCR_SPACE_API_KEY=...
   flyctl secrets set DEEPL_API_KEY=...
   ```
5. Откройте `https://home-chef-os.fly.dev`

---

## Вариант 3: локально

Подходит если у вас есть домашний сервер или Mac/Linux машина:

```bash
git clone https://github.com/Almaz661/home-chef-os.git
cd home-chef-os
npm install
cp .env.example .env  # отредактируйте если нужно
npm run build
npm start
```

Откройте `http://localhost:3000`.

---

## Получить API-ключи

### OCR.space (для сканирования чеков)

1. Зайдите на https://ocr.space/ocrapi
2. Прокрутите до **"Free API key"** (синяя кнопка)
3. Введите email → ключ придёт на почту мгновенно
4. Скопируйте — это и есть `OCR_SPACE_API_KEY`

Лимит: 25 000 запросов/месяц, поддерживает голландский.

### DeepL (для перевода NL → RU)

1. Зайдите на https://www.deepl.com/pro-api
2. Выберите **"DeepL API Free"** → нажмите **"Sign up for free"**
3. Зарегистрируйтесь (нужна карта для верификации, но списаний на Free плане нет)
4. После входа — раздел **"Account"** → **"Authentication Key for DeepL API"**
5. Скопируйте ключ — это и есть `DEEPL_API_KEY`

Лимит: 500 000 символов/месяц. Один чек ≈ 200–500 символов.

### Курс EUR → RUB

**Не нужен ключ!** Используются открытые API: Frankfurter (ECB) и open.er-api.com.
Курс автоматически кэшируется на 24 часа.

---

## Если что-то пошло не так

- **«Application failed to respond» на Render:** инстанс засыпает.
  Подождите 30–60 секунд и обновите страницу.
- **«Cannot find module 'better-sqlite3'»:** проверьте, что Node v22 (на Render
  выставляется через `NODE_VERSION=22`).
- **«Невозможно сохранить рецепт»:** проверьте логи сервера, возможно БД
  read-only. На Render Free это нормально — при следующем деплое БД пересоздастся.
- **Любая другая ошибка:** скиньте мне через PR-комментарий или новое сообщение,
  разберёмся.
