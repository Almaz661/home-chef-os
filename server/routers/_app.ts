import { router } from '../trpc.js';
import { authRouter } from './auth.js';
import { recipesRouter } from './recipes.js';
import { menuRouter } from './menu.js';
import { shoppingRouter } from './shopping.js';
import { inventoryRouter } from './inventory.js';
import { productsRouter } from './products.js';

export const appRouter = router({
  auth: authRouter,
  recipes: recipesRouter,
  menu: menuRouter,
  shopping: shoppingRouter,
  inventory: inventoryRouter,
  products: productsRouter,
});

export type AppRouter = typeof appRouter;
