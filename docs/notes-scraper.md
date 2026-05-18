# Menunedeli.ru Scraper Notes

## Schema.org JSON-LD Structure
The site uses `application/ld+json` with `@type: Recipe`:
- `name` - recipe title
- `image` - main photo URL (e.g. https://menunedeli.ru/wp-content/uploads/2024/11/...)
- `recipeYield` - servings (e.g. "4 порции")
- `cookTime` - ISO duration (e.g. "PT30M")
- `prepTime` - ISO duration
- `totalTime` - ISO duration
- `recipeIngredient` - array of strings (e.g. "Филе куриное – 500 г")
- `recipeInstructions` - array of HowToStep objects with `name` and `text`
- `aggregateRating` - ratingValue, reviewCount
- `author` - Person with name

## Page Structure
- Recipe listing pages have links to `/recipe/slug/`
- Each recipe page has JSON-LD in `<script type="application/ld+json">`
- Photos in steps are in the HTML but NOT in JSON-LD
- Step photos are `<img>` inside step containers

## URLs for mass import (from /uzhin-za-30-minut/):
1. https://menunedeli.ru/recipe/kurica-s-ovoshhami-na-skovorode/
2. https://menunedeli.ru/recipe/befstroganov-iz-svininy/
3. https://menunedeli.ru/recipe/file-mintaya-v-duxovke-samyj-vkusnyj-recept/
4. https://menunedeli.ru/recipe/makarony-s-kolbasoj-na-skovorode/
5. https://menunedeli.ru/recipe/zazharka-iz-svininy-na-skovorode-s-lukom/
6. https://menunedeli.ru/recipe/kurinoe-file-v-klyare/
7. https://menunedeli.ru/recipe/makarony-s-tushenkoj/
8. https://menunedeli.ru/recipe/kak-pravilno-gotovit-pastu-karbonara-klassicheskaya-italyanskaya-kuxnya/
9. https://menunedeli.ru/recipe/pechen-s-lukom-na-skovorode/
10. https://menunedeli.ru/recipe/kurica-s-cukini-i-pomidorom-na-skovorodke/
11. https://menunedeli.ru/recipe/oladi-iz-kurinoj-pecheni-recept-pp/
12. https://menunedeli.ru/recipe/ryba-v-klyare-na-skovorode-prostoj-recept/
13. https://menunedeli.ru/recipe/svinina-v-soevom-souse/
14. https://menunedeli.ru/recipe/eskalop-iz-svininy-na-skovorode/
15. https://menunedeli.ru/recipe/penne-so-shpinatom-i-pomidorami-cherri/

## Strategy
1. Fetch page HTML with fetch/axios
2. Parse JSON-LD with cheerio for structured data
3. Extract step images from HTML with cheerio
4. Download main image + step images to S3 via storagePut
5. For non-Schema.org sites, fall back to LLM extraction
