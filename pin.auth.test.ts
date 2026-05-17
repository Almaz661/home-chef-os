import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "../shared/const";

// Mock the db module
vi.mock("./db", () => ({
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue(null),
  createUser: vi.fn().mockResolvedValue({ id: 1, name: "Тест", pin: "hash", role: "user" }),
  updateUserPin: vi.fn().mockResolvedValue(undefined),
  getRecipes: vi.fn().mockResolvedValue([]),
  getRecipeById: vi.fn().mockResolvedValue(null),
  createRecipe: vi.fn().mockResolvedValue({ id: 1, title: "Тест" }),
  getShoppingList: vi.fn().mockResolvedValue([]),
  getDashboardStats: vi.fn().mockResolvedValue({ recipeCount: 0, shoppingCount: 0, inventoryCount: 0 }),
  getInventory: vi.fn().mockResolvedValue([]),
  getProducts: vi.fn().mockResolvedValue([]),
  getOrCreateWeeklyMenu: vi.fn().mockResolvedValue({ id: 1, weekStart: "2025-01-06", userId: 1, items: [] }),
}));

function makeCtx(user: TrpcContext["user"] = null): TrpcContext {
  const cookies: Record<string, unknown>[] = [];
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      cookie: (_name: string, _val: string, opts: Record<string, unknown>) => cookies.push(opts),
      clearCookie: (_name: string, opts: Record<string, unknown>) => cookies.push(opts),
    } as unknown as TrpcContext["res"],
  };
}

describe("auth.listUsers", () => {
  it("returns empty list when no users exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.listUsers();
    expect(result).toEqual([]);
  });
});

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("auth.setup", () => {
  it("creates the first user when no users exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.setup({ name: "Семья", pin: "1234" });
    expect(result.success).toBe(true);
    expect(result.userId).toBe(1);
  });
});

describe("dashboard.stats", () => {
  it("returns stats with zero counts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.dashboard.stats({ userId: 1 });
    expect(result.recipeCount).toBe(0);
    expect(result.shoppingCount).toBe(0);
    expect(result.inventoryCount).toBe(0);
  });
});

describe("recipes.list", () => {
  it("returns empty list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.recipes.list({});
    expect(result).toEqual([]);
  });
});

describe("shopping.list", () => {
  it("returns empty shopping list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.shopping.list({ userId: 1 });
    expect(result).toEqual([]);
  });
});

describe("inventory.list", () => {
  it("returns empty inventory", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.inventory.list({ userId: 1, location: "fridge" });
    expect(result).toEqual([]);
  });
});

describe("products.list", () => {
  it("returns empty products list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.products.list({});
    expect(result).toEqual([]);
  });
});
