# QA Investigation Notes

## Dashboard Issues
1. "Рецепт дня" section NOT rendering - `featuredRecipe` is falsy
2. Recent recipes section renders but with ChefHat icons instead of images
3. The DOM shows max line 120 but the file has 235 lines - suggests the OLDER version of the component is being served
4. After server restart, still the same issue
5. The recipes API returns 20 recipes, 19 with imageUrl
6. The HTML has `object-cover` class (3 times) but NO `<img>` tags
7. This means the `recipe.imageUrl` check is failing even though the API returns imageUrl

## Root Cause Hypothesis
The Dashboard.tsx file has TWO versions of the recent recipes section:
- Lines ~100-120: OLD version without images (just icons)
- Lines ~166-218: NEW version with thumbnails

Both are in the same file. The OLD version is rendering because it comes FIRST.
Need to check if there's a duplicate section.

## Other Bugs Found
- В покупки button on Menu page - no visible effect
- Recipe edit form - existing photo not shown
- Recipe edit form - description not pre-filled
- Recipe edit form - prep/cook time empty
- Products page - skeleton with empty state
