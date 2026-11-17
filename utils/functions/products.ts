import * as z from "zod";
import { prisma } from "../../lib/prisma.js";
import { redis } from "../../lib/redis.js";
import { convertFromMinorUnit } from "../types/index.js";
import {
  ROLE_PERMISSIONS,
  type StorePermission,
} from "../types/permission.js";

// ─── Schemas ────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const productFiltersSchema = z.object({
  search: z.string().trim().min(1).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  sort: z
    .enum(["newest", "oldest", "name_asc", "name_desc", "price_asc", "price_desc"])
    .default("newest"),
  status: z.enum(["active", "inactive", "all"]).default("active"),
});

export const productQuerySchema = paginationSchema.merge(productFiltersSchema);

export type ProductQueryInput = z.infer<typeof productQuerySchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Checks if the caller is an authorized member of the store with permission
 * to view store management data (e.g. inactive or archived products).
 */
export async function verifyStoreMemberAccess(
  user: any,
  storeId: number,
  requiredPermission: StorePermission = "VIEW_STORE",
): Promise<{ authorized: boolean; statusCode?: number; message?: string }> {
  if (!user || !user.sub) {
    return {
      authorized: false,
      statusCode: 401,
      message: "Authentication required to view inactive or archived products",
    };
  }

  const membership = await prisma.storeMembership.findFirst({
    where: {
      store_id: storeId,
      user_id: Number(user.sub),
    },
  });

  if (!membership) {
    return {
      authorized: false,
      statusCode: 403,
      message: "You are not a member of this store",
    };
  }

  const permissions = ROLE_PERMISSIONS[membership.role] ?? [];
  if (
    !permissions.includes(requiredPermission) &&
    !permissions.includes("MANAGE_PRODUCTS")
  ) {
    return {
      authorized: false,
      statusCode: 403,
      message: "You don't have permission to view store management data",
    };
  }

  return { authorized: true };
}

/**
 * Converts BigInt price amounts to human-readable decimal strings
 * so the product can be safely serialized to JSON.
 */
export function serializeProduct(product: any) {
  return {
    ...product,
    prices: product.prices.map((p: any) => ({
      ...p,
      amount: convertFromMinorUnit(p.amount),
    })),
  };
}

/**
 * Returns a Prisma-compatible orderBy clause for non-price sort fields.
 * Price sorts are handled separately via ProductPrice queries.
 */
export function buildOrderBy(sort: string): Record<string, string> {
  switch (sort) {
    case "oldest":    return { created_at: "asc" };
    case "name_asc":  return { name: "asc" };
    case "name_desc": return { name: "desc" };
    case "newest":
    default:          return { created_at: "desc" };
  }
}

/**
 * Returns true when the sort value requires ordering by ProductPrice.amount.
 */
export function isPriceSort(sort: string): boolean {
  return sort === "price_asc" || sort === "price_desc";
}

/**
 * Returns the Prisma sort direction for price sorts.
 */
export function priceSortDirection(sort: string): "asc" | "desc" {
  return sort === "price_asc" ? "asc" : "desc";
}

// ─── Redis Cache Helpers ─────────────────────────────────────────────────────

export const PRODUCTS_CACHE_TTL = 5 * 60; // 5 minutes

export function getAllProductsCacheKey(params: {
  page: number;
  limit: number;
  search?: string;
  category_id?: number;
  sort: string;
}): string {
  return `products:all:p=${params.page}:l=${params.limit}:c=${params.category_id ?? "all"}:s=${params.search ?? ""}:sort=${params.sort}`;
}

export function getStoreProductsCacheKey(params: {
  store_id: number;
  status: string;
  page: number;
  limit: number;
  search?: string;
  category_id?: number;
  sort: string;
}): string {
  return `products:store:${params.store_id}:status=${params.status}:p=${params.page}:l=${params.limit}:c=${params.category_id ?? "all"}:s=${params.search ?? ""}:sort=${params.sort}`;
}

/**
 * Invalidates cached product lists in Redis.
 * Called when products are created, updated, or deleted.
 */
export async function invalidateProductsCache(storeId?: number): Promise<void> {
  try {
    const keysToDelete: string[] = [];

    const allKeys = await redis.keys("products:all:*");
    keysToDelete.push(...allKeys);

    if (storeId) {
      const storeKeys = await redis.keys(`products:store:${storeId}:*`);
      keysToDelete.push(...storeKeys);
    }

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch (error) {
    console.error("Failed to invalidate products cache:", error);
  }
}
