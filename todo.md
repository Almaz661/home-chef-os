# ШефДом — TODO

## Database & Schema
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
- [x] Login page with 4-digit PIN pad (warm orange theme, Russian UI)
- [x] Dashboard (stats cards: рецепты, покупки, инвентарь)
- [x] Recipes list page (search, filter by category)
- [x] Recipe detail page (ingredients, steps, timers, portion scaling)
- [x] Add/Edit recipe page (form with ingredient + step management)
- [x] Weekly menu planner (7×3 grid, week navigation, generate shopping list)
- [x] Shopping list page (grouped by category, checkboxes, progress bar, clear checked)
- [x] Inventory page (3 tabs: Холодильник, Морозилка, Кладовая; expiry dates, color indicators)
- [x] Products catalog page (searchable, grouped by category, CRUD)

## Design & UX
- [x] Warm orange and cream color theme (Tailwind CSS 4 OKLCH)
- [x] iPad-first layout with large touch targets (min 44px)
- [x] Full Russian UI (all labels, buttons, messages, navigation)
- [x] Custom AppLayout with sidebar navigation
- [x] Responsive for mobile

## PWA
- [x] manifest.json for iPad home-screen installation
- [x] Service Worker for offline access

## Testing & Deployment
- [x] Vitest tests for PIN auth and key procedures (9 tests passing)
- [x] Save checkpoint
- [x] Deploy to permanent .manus.space URL

## Recipe Import (Wave 2)
- [x] Install Cheerio for HTML parsing
- [x] Build server-side recipe scraper (Schema.org JSON-LD + LLM fallback)
- [x] Add importByUrl tRPC endpoint
- [x] Build mass-import script for menunedeli.ru
- [x] Update AddRecipePage UI with URL import field and "Импортировать" button
- [x] Mass import 14 recipes from menunedeli.ru
- [x] Step images support (imageUrl on recipe_steps)
- [x] Redeploy with import feature

## Image Fix (Wave 3)
- [x] Re-download all existing recipe images from external URLs to S3 storage
- [x] Update imageUrl in DB to point to S3 URLs (17/17 recipes now have S3 images)
- [x] Verify images render correctly in the app
- [x] Deploy with image fix

## Dashboard Image Fix (Wave 3b)
- [x] Show recipe thumbnail photos in "Последние рецепты" list (instead of generic icons)
- [x] Add "Рецепт дня" featured card with photo on Dashboard
- [x] Redeploy

## Wave 4 — Remaining Wave 1 Features
- [x] Auto-fill shopping list from weekly menu (smart ingredient merging: 2 eggs + 3 eggs = 5 eggs)
- [x] Inventory subtraction (show "need to buy" considering what's already in fridge/freezer/pantry)
- [x] Recipe photo upload (upload own photo when creating/editing recipe, store in S3)
- [x] Redeploy with Wave 4 features

## Wave 4b — Quality Fixes
- [x] Make generateShoppingList idempotent (clear prior auto-generated items before re-generating)
- [x] Show inventory-adjusted context on ShoppingPage (e.g. "было в запасах: X, нужно купить: Y")
- [x] Add tests for shopping list generation, merging, and inventory subtraction (12 tests passing)

## Wave 5 — Image Fix for URL Import
- [x] Universal image extraction in recipeParser: Schema.org → og:image → twitter:image → HTML heuristic
- [x] LLM fallback path now also extracts and downloads images
- [x] downloadAndStoreImage: validates content-type, skips tiny files, adds Referer header
- [x] Redeploy with image fix

## QA Bug Fixes (Wave 6)
- [ ] [CRITICAL] Fix В покупки button on Menu page — no visible effect on click
- [ ] [HIGH] Home page: show recipe photo thumbnails instead of emoji icons
- [ ] [HIGH] Recipe edit form: show existing photo in edit mode
- [ ] [HIGH] Recipe edit form: pre-fill description textarea
- [ ] [MEDIUM] Recipe edit form: pre-fill prep/cook time fields
- [ ] [LOW] Products page: hide skeleton rows when showing empty state
- [ ] [LOW] Home page: fix category text truncation
