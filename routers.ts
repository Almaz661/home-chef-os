import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import * as db from "./db";
import { parseAndPrepareRecipe } from "./recipeParser";
import { imageRedownloadRouter } from "./imageRedownloadRouter";

// ─── PIN Auth helpers ─────────────────────────────────────────────────────────
// Simple bcrypt-free PIN hashing using SHA-256 via Web Crypto (available in Node 18+)
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + "shefdom_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const computed = await hashPin(pin);
  return computed === hash;
}

async function createSessionToken(userId: number): Promise<string> {
  const secret = new TextEncoder().encode(ENV.jwtSecret);
  const token = await new (await import("jose")).SignJWT({ userId, type: "pin-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  return token;
}

// ─── Auth router (PIN-based) ──────────────────────────────────────────────────
const authRouter = router({
  // Check current session
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    // Return user from our users table using id
    const user = await db.getUserById(ctx.user.id);
    return user ? { id: user.id, name: user.name, role: user.role } : null;
  }),

  // List all users (for PIN selection screen)
  listUsers: publicProcedure.query(async () => {
    const allUsers = await db.getAllUsers();
    return allUsers.map(u => ({ id: u.id, name: u.name }));
  }),

  // Login with PIN
  login: publicProcedure
    .input(z.object({ userId: z.number(), pin: z.string().length(4) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
      const valid = await verifyPin(input.pin, user.pin);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный PIN-код" });
      const token = await createSessionToken(user.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
      return { success: true, user: { id: user.id, name: user.name, role: user.role } };
    }),

  // Logout
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  // Setup: create the first user (only if no users exist)
  setup: publicProcedure
    .input(z.object({ name: z.string().min(1).max(64), pin: z.string().length(4) }))
    .mutation(async ({ input }) => {
      const allUsers = await db.getAllUsers();
      if (allUsers.length > 0) throw new TRPCError({ code: "FORBIDDEN", message: "Пользователи уже созданы" });
      const pinHash = await hashPin(input.pin);
      const user = await db.createUser({ name: input.name, pin: pinHash });
      return { success: true, userId: user?.id };
    }),

  // Add a family member
  addUser: publicProcedure
    .input(z.object({ name: z.string().min(1).max(64), pin: z.string().length(4) }))
    .mutation(async ({ input }) => {
      const pinHash = await hashPin(input.pin);
      const user = await db.createUser({ name: input.name, pin: pinHash });
      return { success: true, userId: user?.id };
    }),

  // Change PIN
  changePin: publicProcedure
    .input(z.object({ userId: z.number(), oldPin: z.string().length(4), newPin: z.string().length(4) }))
    .mutation(async ({ input }) => {
      const user = await db.getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      const valid = await verifyPin(input.oldPin, user.pin);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный текущий PIN" });
      const newHash = await hashPin(input.newPin);
      await db.updateUserPin(input.userId, newHash);
      return { success: true };
    }),
});

// ─── Recipes router ───────────────────────────────────────────────────────────
const recipesRouter = router({
  list: publicProcedure
    .input(z.object({ search: z.string().optional(), category: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.getRecipes(input?.search, input?.category);
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const recipe = await db.getRecipeById(input.id);
      if (!recipe) throw new TRPCError({ code: "NOT_FOUND", message: "Рецепт не найден" });
      return recipe;
    }),

  create: publicProcedure
    .input(z.object({
      title: z.string().min(1).max(512),
      description: z.string().optional(),
      servings: z.number().min(1).default(4),
      prepTime: z.number().min(0).default(0),
      cookTime: z.number().min(0).default(0),
      totalTime: z.number().min(0).default(0),
      category: z.string().optional(),
      cuisine: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      calories: z.number().optional(),
      sourceUrl: z.string().optional(),
      imageUrl: z.string().optional(),
      ingredients: z.array(z.object({
        name: z.string().min(1),
        amount: z.number().optional(),
        unit: z.string().optional(),
        sortOrder: z.number().default(0),
      })).default([]),
      steps: z.array(z.object({
        stepNumber: z.number(),
        instruction: z.string().min(1),
        imageUrl: z.string().optional(),
        timerMinutes: z.number().optional(),
      })).default([]),
    }))
    .mutation(async ({ input }) => {
      const { ingredients, steps, ...recipeData } = input;
      return db.createRecipe(recipeData as any, ingredients as any, steps as any);
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(512).optional(),
      description: z.string().optional(),
      servings: z.number().min(1).optional(),
      prepTime: z.number().min(0).optional(),
      cookTime: z.number().min(0).optional(),
      totalTime: z.number().min(0).optional(),
      category: z.string().optional(),
      cuisine: z.string().optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      calories: z.number().optional(),
      sourceUrl: z.string().optional(),
      imageUrl: z.string().optional(),
      ingredients: z.array(z.object({
        name: z.string().min(1),
        amount: z.number().optional(),
        unit: z.string().optional(),
        sortOrder: z.number().default(0),
      })).optional(),
      steps: z.array(z.object({
        stepNumber: z.number(),
        instruction: z.string().min(1),
        imageUrl: z.string().optional(),
        timerMinutes: z.number().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ingredients, steps, ...recipeData } = input;
      return db.updateRecipe(id, recipeData as any, ingredients as any, steps as any);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteRecipe(input.id);
      return { success: true };
    }),

  toggleFavorite: publicProcedure
    .input(z.object({ id: z.number(), isFavorite: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.toggleRecipeFavorite(input.id, input.isFavorite);
      return { success: true };
    }),

  uploadPhoto: publicProcedure
    .input(z.object({
      recipeId: z.number().optional(), // if editing existing recipe
      imageBase64: z.string(), // base64-encoded image data
      mimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ input }) => {
      const { storagePut } = await import("./storage");
      // Decode base64 to buffer
      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.mimeType.includes("png") ? "png" : input.mimeType.includes("webp") ? "webp" : "jpg";
      const fileName = `recipes/photo_${Date.now()}.${ext}`;
      const { url } = await storagePut(fileName, buffer, input.mimeType);

      // If recipeId provided, update the recipe imageUrl
      if (input.recipeId) {
        await db.updateRecipe(input.recipeId, { imageUrl: url } as any);
      }
      return { url };
    }),

  importByUrl: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      const parsed = await parseAndPrepareRecipe(input.url);
      const recipeData = {
        title: parsed.title,
        description: parsed.description,
        imageUrl: parsed.imageUrl,
        servings: parsed.servings || 4,
        prepTime: parsed.prepTime || 0,
        cookTime: parsed.cookTime || 0,
        totalTime: parsed.totalTime || 0,
        category: parsed.category || "Основные блюда",
        cuisine: parsed.cuisine || "Русская",
        difficulty: parsed.difficulty || "medium",
        calories: parsed.calories,
        sourceUrl: parsed.sourceUrl,
      };
      const ingredients = parsed.ingredients.map((ing, idx) => ({
        name: ing.name,
        amount: (typeof ing.amount === "number" && isFinite(ing.amount)) ? ing.amount : null,
        unit: ing.unit || "",
        sortOrder: idx,
      }));
      const steps = parsed.steps.map(s => ({
        stepNumber: s.stepNumber,
        instruction: s.instruction,
        imageUrl: s.imageUrl,
        timerMinutes: undefined,
      }));
      return db.createRecipe(recipeData as any, ingredients as any, steps as any);
    }),
});

// ─── Menu router ──────────────────────────────────────────────────────────────
const menuRouter = router({
  getWeek: publicProcedure
    .input(z.object({ weekStart: z.string(), userId: z.number().default(1) }))
    .query(async ({ input }) => {
      return db.getOrCreateWeeklyMenu(input.userId, input.weekStart);
    }),

  addItem: publicProcedure
    .input(z.object({
      menuId: z.number(),
      recipeId: z.number(),
      dayOfWeek: z.number().min(0).max(6),
      mealType: z.enum(["breakfast", "lunch", "dinner"]),
      servings: z.number().min(1).default(4),
    }))
    .mutation(async ({ input }) => {
      return db.addMenuItem(input as any);
    }),

  removeItem: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.removeMenuItem(input.id);
      return { success: true };
    }),

    generateShoppingList: publicProcedure
    .input(z.object({ weekStart: z.string(), userId: z.number().default(1) }))
    .mutation(async ({ input }) => {
      const menu = await db.getOrCreateWeeklyMenu(input.userId, input.weekStart);
      if (menu.items.length === 0) {
        return { success: true, count: 0, message: "Меню пустое — нечего добавлять" };
      }
      // 0. Idempotency: clear prior auto-generated items for this specific menu
      await db.clearAutoGeneratedShoppingItems(input.userId, menu.id);
      // 1. Collect ALL ingredients from ALL menu items (with servings scaling)
      const merged = new Map<string, { name: string; amount: number; unit: string; recipeIds: Set<number> }>();

      for (const menuItem of menu.items) {
        const recipe = await db.getRecipeById(menuItem.recipeId);
        if (!recipe) continue;
        const scale = (menuItem.servings ?? recipe.servings) / (recipe.servings || 4);

        for (const ing of recipe.ingredients) {
          const key = `${ing.name.toLowerCase().trim()}|${(ing.unit ?? "").toLowerCase().trim()}`;
          const existing = merged.get(key);
          const scaledAmount = (ing.amount ?? 0) * scale;
          if (existing) {
            existing.amount += scaledAmount;
            existing.recipeIds.add(menuItem.recipeId);
          } else {
            merged.set(key, {
              name: ing.name.trim(),
              amount: scaledAmount,
              unit: (ing.unit ?? "").trim(),
              recipeIds: new Set([menuItem.recipeId]),
            });
          }
        }
      }

      // 2. Get inventory for subtraction
      const inventoryItems = await db.getInventory(input.userId);
      const inventoryMap = new Map<string, number>();
      for (const inv of inventoryItems) {
        const key = `${inv.name.toLowerCase().trim()}|${(inv.unit ?? "").toLowerCase().trim()}`;
        inventoryMap.set(key, (inventoryMap.get(key) ?? 0) + (inv.amount ?? 0));
      }

            // 3. Subtract inventory and add remaining to shopping list
      const addedItems: any[] = [];
      let skippedCount = 0;
      for (const [key, item] of Array.from(merged)) {
        const inStock = inventoryMap.get(key) ?? 0;
        let neededAmount = item.amount - inStock;
        let note: string | undefined;
        // If amount is 0 (no numeric amount), always add
        if (item.amount === 0) {
          neededAmount = 0;
        } else if (neededAmount <= 0) {
          skippedCount++;
          continue; // Already have enough in inventory
        } else if (inStock > 0) {
          // Partially covered by inventory — add context note showing both values
          const roundedStock = Math.round(inStock * 100) / 100;
          const roundedNeed = Math.round(neededAmount * 100) / 100;
          note = `в запасах: ${roundedStock} ${item.unit}, нужно купить: ${roundedNeed} ${item.unit}`.trim();
        }

        // Determine category based on ingredient name
        const nameLower = item.name.toLowerCase();
        let category = "Из меню";
        if (/молок|сметан|сливк|сыр|творог|кефир|йогурт|масл.*сливоч/i.test(nameLower)) category = "Молочные";
        else if (/курин|куриц|мяс|говяд|свинин|фарш|бекон|колбас|сосис|ветчин|индейк/i.test(nameLower)) category = "Мясо и рыба";
        else if (/рыб|лосос|сёмг|тунец|креветк|кальмар|форел/i.test(nameLower)) category = "Мясо и рыба";
        else if (/картоф|морков|лук|чеснок|помидор|огурец|перец|капуст|свёкл|свекл|баклажан|кабачок|зелен|петрушк|укроп|салат|шпинат|горох|фасол|бобы/i.test(nameLower)) category = "Овощи и фрукты";
        else if (/яблок|банан|апельсин|лимон|ягод|клубник|малин|виноград|груш|слив|персик|манго/i.test(nameLower)) category = "Овощи и фрукты";
        else if (/мук|сахар|соль|перец.*молот|специ|крупа|рис|гречк|овсян|макарон|спагетт|паста|масло.*растит|масло.*подсолн|масло.*оливк|уксус|соус|томатн|кетчуп|майонез|дрожж|разрыхл|крахмал|панировк|сухар/i.test(nameLower)) category = "Бакалея";
        else if (/яйц|яйцо/i.test(nameLower)) category = "Бакалея";
        else if (/вод[аы]|сок|чай|кофе|компот|морс|молоко.*кокос/i.test(nameLower)) category = "Напитки";

        const shopItem = await db.addShoppingItem({
          userId: input.userId,
          name: item.name,
          amount: neededAmount > 0 ? Math.round(neededAmount * 100) / 100 : undefined,
          unit: item.unit,
          category,
          isChecked: false,
          recipeId: Array.from(item.recipeIds)[0] as number,
          menuId: menu.id,
          note,
        });
        addedItems.push(shopItem);
      }

      const msg = skippedCount > 0
        ? `Добавлено ${addedItems.length} товаров (${skippedCount} уже есть в запасах)`
        : `Добавлено ${addedItems.length} товаров в список покупок`;
      return { success: true, count: addedItems.length, skipped: skippedCount, message: msg };
    }),
});

// ─── Shopping router ──────────────────────────────────────────────────────────
const shoppingRouter = router({
  list: publicProcedure
    .input(z.object({ userId: z.number().default(1) }))
    .query(async ({ input }) => {
      return db.getShoppingList(input.userId);
    }),

  add: publicProcedure
    .input(z.object({
      userId: z.number().default(1),
      name: z.string().min(1),
      amount: z.number().optional(),
      unit: z.string().optional(),
      category: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.addShoppingItem({ ...input, isChecked: false } as any);
    }),

  toggle: publicProcedure
    .input(z.object({ id: z.number(), isChecked: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.toggleShoppingItem(input.id, input.isChecked);
      return { success: true };
    }),

  clearChecked: publicProcedure
    .input(z.object({ userId: z.number().default(1) }))
    .mutation(async ({ input }) => {
      await db.clearCheckedItems(input.userId);
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteShoppingItem(input.id);
      return { success: true };
    }),
});

// ─── Inventory router ─────────────────────────────────────────────────────────
const inventoryRouter = router({
  list: publicProcedure
    .input(z.object({ userId: z.number().default(1), location: z.string().optional() }))
    .query(async ({ input }) => {
      return db.getInventory(input.userId, input.location);
    }),

  add: publicProcedure
    .input(z.object({
      userId: z.number().default(1),
      name: z.string().min(1),
      location: z.enum(["fridge", "freezer", "pantry"]).default("fridge"),
      amount: z.number().optional(),
      unit: z.string().optional(),
      category: z.string().optional(),
      expiryDate: z.string().optional(),
      stockLevel: z.enum(["full", "medium", "low"]).default("full"),
    }))
    .mutation(async ({ input }) => {
      return db.addInventoryItem(input as any);
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      location: z.enum(["fridge", "freezer", "pantry"]).optional(),
      amount: z.number().optional(),
      unit: z.string().optional(),
      category: z.string().optional(),
      expiryDate: z.string().optional(),
      stockLevel: z.enum(["full", "medium", "low"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateInventoryItem(id, data as any);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteInventoryItem(input.id);
      return { success: true };
    }),
});

// ─── Products router ──────────────────────────────────────────────────────────
const productsRouter = router({
  list: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return db.getProducts(input?.search);
    }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      category: z.string().default("Прочее"),
      unit: z.string().default("шт"),
      calories: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return db.createProduct(input as any);
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(256).optional(),
      category: z.string().optional(),
      unit: z.string().optional(),
      calories: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return db.updateProduct(id, data as any);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProduct(input.id);
      return { success: true };
    }),
});

// ─── Dashboard router ─────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: publicProcedure
    .input(z.object({ userId: z.number().default(1) }))
    .query(async ({ input }) => {
      return db.getDashboardStats(input.userId);
    }),
});

// ─── App router ───────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  recipes: recipesRouter,
  menu: menuRouter,
  shopping: shoppingRouter,
  inventory: inventoryRouter,
  products: productsRouter,
  dashboard: dashboardRouter,
  imageAdmin: imageRedownloadRouter,
});

export type AppRouter = typeof appRouter;
