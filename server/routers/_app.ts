import { router } from '../trpc.js';
import { authRouter } from './auth.js';
import { recipesRouter } from './recipes.js';
import { menuRouter } from './menu.js';
import { shoppingRouter } from './shopping.js';
import { inventoryRouter } from './inventory.js';
import { productsRouter } from './products.js';
import { receiptsRouter } from './receipts.js';
import { currencyRouter } from './currency.js';

export const appRouter = router({
  auth: authRouter,
  recipes: recipesRouter,
  menu: menuRouter,
  shopping: shoppingRouter,
  inventory: inventoryRouter,
  products: productsRouter,
  receipts: receiptsRouter,
  currency: currencyRouter,
});

export type AppRouter = typeof appRouter;
