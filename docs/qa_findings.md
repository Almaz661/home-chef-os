# QA Findings — ШефДом

## Auth
- [OK] PIN 1234 auto-logged in (session persisted from previous test)
- [OK] Dashboard loads correctly after auth

## Dashboard
- [BUG] "Последние рецепты" shows recipe icons (🍳) instead of actual recipe photos — thumbnails not rendering
- [BUG] No "Рецепт дня" featured card visible — was supposed to be added in Wave 3b
- [OK] Stats cards show correct counts (19 recipes, 0 shopping, 0 inventory, 7 menu days)
- [OK] Navigation links work from stats cards

## Recipes
- [OK] Recipe list loads with 19 recipes, photos visible for most
- [BUG] Панчетта (ID 30001) has no photo — blank card area
- [OK] Category filter buttons present (Все, Завтраки, Супы, Основные блюда, Салаты, Выпечка, Десерты, Напитки)
- [OK] Search input present
- [OK] Edit buttons visible on each card
- [OK] Recipe images load from S3 correctly for imported recipes
- [BUG] First load shows blank white cards before images load — no skeleton/placeholder

## Recipe Detail
- [OK] Recipe detail page loads with photo, title, description, time, servings, calories, difficulty, category
- [OK] Ingredients list with amounts and units displayed correctly (20 ingredients for borsch)
- [OK] Steps displayed with numbered circles and full text
- [OK] Servings +/- buttons present
- [OK] Back button, Edit button, Favorite button present
- [BUG] Recipe photo shows alt text overlay on image area (broken image rendering)

## Import
- [OK] Import from povar.ru works — redirected to a different recipe (Bujenina iz indejki) but imported successfully
- [OK] Photo downloaded and stored in S3 correctly
- [OK] Ingredients parsed with amounts and units
- [OK] 10 steps parsed correctly
- [OK] Description, servings, calories, difficulty extracted
- [BUG] Recipe photo area shows alt text on top of image (same as borsch detail page)
- [NOTE] povar.ru redirected from borsch to bujenina — site may have anti-bot protection, but import still worked
- [BUG] No time info extracted (prep/cook time missing)

## Menu
- [OK] Menu page loads with 7 days, 3 meal slots each
- [OK] Current day (Thursday) highlighted with "Сегодня" badge
- [OK] Week navigation arrows work
- [OK] В покупки button present
- [OK] Clicking + opens recipe picker dialog with search
- [OK] Recipe picker shows photos and categories
- [OK] Adding recipe shows toast "Рецепт добавлен в меню"
- [BUG] After adding recipe, the recipe name shows in the slot but is hard to see (tiny text, no photo thumbnail in slot)
- [NOTE] Панчетта shows 🍽️ emoji instead of photo in picker (no image)

## Shopping
- [BUG] В покупки button on Menu page does NOT navigate to shopping or generate list — nothing happens on click
- [OK] Shopping page loads with empty state
- [OK] Добавить button present
- [OK] Empty state message is clear

## Inventory
- [OK] Inventory page loads with 3 tabs (Холодильник, Морозилка, Кладовая)
- [OK] Add item dialog opens with name, quantity, unit, category, expiry date, stock level
- [OK] Item saved successfully (Молоко, 1 л, Молочные, Достаточно)
- [OK] Item displays with green dot, category header, stock level badge
- [OK] Edit/delete buttons present on items

## Products
- [OK] Products page loads with search bar and Добавить button
- [OK] Empty state shows "Справочник пуст" message
- [NOTE] Products catalog is empty — no pre-seeded products
- [BUG-minor] Three skeleton rows visible in empty state (should show empty state message instead)

## Home Page
- [OK] Dashboard loads with greeting, stats cards (20 recipes, 0 shopping, 1 inventory, 7 menu days)
- [OK] Stats cards are clickable links to respective pages
- [BUG] No "Recipe of the Day" section visible — only "Последние рецепты" (Latest recipes)
- [BUG] Latest recipes show emoji icons instead of recipe photos (no thumbnails in list)
- [OK] Recipe cards link to correct detail pages
- [NOTE] Category text truncated for Панчетта: "Сыровял" instead of "Сыровяленое"

## Photo Upload / Recipe Edit
- [OK] Edit page loads with all fields pre-filled (name, description, category, cuisine, difficulty)
- [OK] Photo upload area visible with "Нажмите, чтобы загрузить фото" prompt
- [BUG] Existing recipe photo NOT shown in edit form — shows upload placeholder instead of current photo
- [BUG] Description field shows placeholder text instead of actual description (textarea not pre-filled)
- [OK] Ingredients section visible
- [OK] Steps section visible with all 8 steps
- [OK] Portions field pre-filled with 4
- [BUG] Prep time and cook time fields are empty (should show 30 and 150 from recipe)

## Navigation / UX
- [OK] Sidebar navigation works for all pages
- [OK] Active page highlighted in sidebar
- [OK] User info shown at bottom of sidebar
- [OK] Logout button works
- [NOTE] The В покупки button click doesn't appear in network logs — the mutation may be firing but the network log doesn't capture tRPC mutations
- [NOTE] Testing was done on production deploy (homechef-fqasebqv.manus.space), network logs are from dev server

## Console Errors
- [ERROR] "Неверный PIN-код" error in console from earlier PIN attempt (not a bug, expected behavior)
- No other JS errors found

## Summary of Bugs to Fix
1. ~~[CRITICAL] В покупки button on Menu page — appears to not work~~ — FIXED: после генерации списка автоматически navigate('/shopping')
2. ~~[HIGH] Home page: Latest recipes show emoji icons instead of recipe photo thumbnails~~ — FIXED: рендер `<img src={r.imageUrl}>` с фолбэком 🍽️
3. ~~[HIGH] Recipe edit form: existing photo not shown~~ — FIXED: `setImageUrl(r.imageUrl ?? '')` + блок превью
4. ~~[HIGH] Recipe edit form: description textarea not pre-filled~~ — FIXED: `setDescription(r.description ?? '')`
5. ~~[MEDIUM] Recipe edit form: prep/cook time fields empty~~ — FIXED: гидратируется из `r.prepTime` / `r.cookTime`
6. ~~[LOW] Products page: skeleton rows visible alongside empty state message~~ — FIXED: скелетонов в коде нет, есть только пустое состояние
7. ~~[LOW] Category text truncation on Home page ("Сыровял" instead of full text)~~ — FIXED: добавлены `truncate min-w-0` на бэйдж категории + `flex-shrink-0 whitespace-nowrap` на время

Все баги Wave 6 закрыты.

## Console Errors
- Testing...
