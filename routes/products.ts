import { Router, type Request, type Response } from "express";
import * as z from "zod";
import { authenticateAndVerifyCsrf, optionalAuth } from "../middleware/auth.js";
import { requireStorePermission } from "../middleware/store.js";
import {
  cleanupProductImages,
  uploadProductImagesToCloudinary,
  validateProductCreateInput,
  validateProductUpdateInput,
} from "../middleware/products.js";
import { upload } from "../lib/multer.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { Product_prices } from "../utils/types/products.js";
import { convertToMinorUnit } from "../utils/types/index.js";
import {
  PRODUCTS_CACHE_TTL,
  buildOrderBy,
  getAllProductsCacheKey,
  getStoreProductsCacheKey,
  invalidateProductsCache,
  paginationSchema,
  productFiltersSchema,
  serializeProduct,
  verifyStoreMemberAccess,
} from "../utils/functions/products.js";
import type {
  ProductWhereInput,
  ProductUncheckedUpdateInput,
  ProductGetPayload,
} from "../generated/prisma/models/Product.js";

type ProductWithRelations = ProductGetPayload<{
  include: {
    category: true;
    productImages: true;
    prices: true;
  };
}>;

const router = Router();

// Create Product route
router.post(
  "/products",
  authenticateAndVerifyCsrf,
  requireStorePermission("MANAGE_PRODUCTS"),
  upload.fields([{ name: "product_images", maxCount: 5 }]),
  validateProductCreateInput,
  uploadProductImagesToCloudinary,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required!" });

      const { category_id, id } = req.query;

      const product_images = req.cloudinaryUploads?.product_images ?? [];
      const image_url = product_images.map((image) => image.secure_url);

      const product = await prisma.product.findFirst({
        where: {
          store_id: Number(id),
          OR: [
            { slug: req.body.slug },
            ...(req.body.sku ? [{ sku: req.body.sku }] : []),
          ],
        },
      });
      const category = await prisma.category.findFirst({
        where: { id: Number(category_id), store_id: Number(id) },
      });

      const membership = await prisma.storeMembership.findFirst({
        where: {
          store_id: Number(id),
          user_id: Number(user.sub),
        },
        include: {
          store: {
            include: {
              storeCurrencies: true,
            },
          },
        },
      });

      if (!membership) {
        await cleanupProductImages(req);

        return res.status(403).json({
          success: false,
          message: "You don't have permission to access this store.",
        });
      }

      if (product) {
        await cleanupProductImages(req);
        return res.status(403).json({
          success: false,
          message: "Product with given or sku slug exists",
        });
      }

      const configuredCurrencies = membership.store.storeCurrencies.map(
        (item) => item.currency,
      );

      if (configuredCurrencies.length === 0) {
        await cleanupProductImages(req);
        return res.status(400).json({
          success: false,
          message:
            "Please configure at least one currency in your store settings before creating products.",
        });
      }

      const submittedCurrencies = new Set(
        req.body.prices.map((item: Product_prices) => item.currency),
      );

      const missingCurrencies = configuredCurrencies.filter(
        (currency) => !submittedCurrencies.has(currency),
      );

      if (missingCurrencies.length > 0) {
        await cleanupProductImages(req);
        return res.status(400).json({
          success: false,
          message: `Please provide prices for all configured store currencies: ${missingCurrencies.join(", ")}`,
          missing_currencies: missingCurrencies,
        });
      }

      if (!category) {
        await cleanupProductImages(req);
        return res
          .status(404)
          .json({ success: false, message: "invalid category selected" });
      }

      const constructedBody = {
        ...req.body,
        product_images: image_url,
      };

      const prices = constructedBody.prices.map((item: Product_prices) => ({
        currency: item.currency,
        amount: convertToMinorUnit(item.amount),
      }));

      await prisma.product.create({
        data: {
          name: constructedBody.name,
          slug: constructedBody.slug,
          description: constructedBody.description,
          stock_quantity: constructedBody.stock_quantity,
          is_active: constructedBody.is_active,
          productImages: {
            create: product_images.map((image) => ({
              image_url: image.secure_url,
              alt_text: constructedBody.name,
            })),
          },
          prices: {
            create: prices,
          },
          sku: constructedBody.sku,
          store: { connect: { id: Number(id) } },
          category: { connect: { id: Number(category_id) } },
        },
      });

      await invalidateProductsCache(Number(id));

      res
        .status(201)
        .json({ success: true, message: "Product creation successful" });
    } catch (err) {
      await cleanupProductImages(req);
      console.error("Problem creatig products:", err);
      return res
        .status(500)
        .json({ success: false, message: "Error creating product" });
    }
  },
);

// GET /products — All active products with pagination, filtering and sorting
router.get("/products", async (req: Request, res: Response) => {
  try {
    const parseResult = paginationSchema
      .merge(productFiltersSchema)
      .safeParse(req.query);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: z.treeifyError(parseResult.error),
      });
    }

    const { page, limit, search, category_id, sort } = parseResult.data;
    const skip = (page - 1) * limit;
    const isPriceSort = sort === "price_asc" || sort === "price_desc";

    const cacheKey = getAllProductsCacheKey({
      page,
      limit,
      search,
      category_id,
      sort,
    });

    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      return res.status(200).json({
        success: true,
        message: "Products fetched successfully",
        data: parsed.data,
        pagination: parsed.pagination,
      });
    }

    const where: ProductWhereInput = {
      is_active: true,
      ...(category_id && { category_id }),
      ...(search && { name: { contains: search, mode: "insensitive" } }),
    };

    let products: ProductWithRelations[];
    const total = await prisma.product.count({ where });

    if (isPriceSort) {
      const priceDirection = sort === "price_asc" ? "asc" : "desc";
      const priceRows = await prisma.productPrice.findMany({
        where: { product: where },
        orderBy: { amount: priceDirection },
        skip,
        take: limit,
        select: { product_id: true },
      });

      const orderedIds = priceRows.map((r) => r.product_id);
      const fetched = await prisma.product.findMany({
        where: { id: { in: orderedIds } },
        include: { category: true, productImages: true, prices: true },
      });
      const map = new Map(fetched.map((p) => [p.id, p]));
      products = orderedIds
        .map((id) => map.get(id))
        .filter((p): p is ProductWithRelations => p !== undefined);
    } else {
      products = await prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildOrderBy(sort),
        include: { category: true, productImages: true, prices: true },
      });
    }

    const totalPages = Math.ceil(total / limit);

    const responsePayload = {
      data: products.map(serializeProduct),
      pagination: {
        total_items: total,
        total_pages: totalPages,
        current_page: page,
        limit,
        has_next_page: page < totalPages,
        has_prev_page: page > 1,
      },
    };

    await redis.set(
      cacheKey,
      JSON.stringify(responsePayload),
      "EX",
      PRODUCTS_CACHE_TTL,
    );

    return res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      ...responsePayload,
    });
  } catch (error) {
    console.error("Problem fetching products:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error fetching products" });
  }
});

// GET /products/:store_id — Active products for a store with pagination, filtering and sorting
router.get(
  "/products/:store_id",
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const schema = paginationSchema.merge(productFiltersSchema).extend({
        store_id: z.coerce.number().int().positive(),
      });

      const parseResult = schema.safeParse({
        ...req.query,
        store_id: req.params.store_id,
      });

      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid parameters",
          errors: z.treeifyError(parseResult.error),
        });
      }

      const { store_id, page, limit, search, category_id, sort, status } =
        parseResult.data;
      const skip = (page - 1) * limit;
      const isPriceSort = sort === "price_asc" || sort === "price_desc";

      const store = await prisma.store.findUnique({ where: { id: store_id } });

      if (!store) {
        return res
          .status(404)
          .json({ success: false, message: "Store not found" });
      }

      // Only authorized store members can retrieve inactive or all products
      if (status !== "active") {
        const auth = await verifyStoreMemberAccess(req.user, store_id);
        if (!auth.authorized) {
          return res.status(auth.statusCode ?? 403).json({
            success: false,
            message: auth.message,
          });
        }
      }

      const cacheKey = getStoreProductsCacheKey({
        store_id,
        status,
        page,
        limit,
        search,
        category_id,
        sort,
      });

      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        return res.status(200).json({
          success: true,
          message: "Store products fetched successfully",
          data: parsed.data,
          pagination: parsed.pagination,
        });
      }

      const where: ProductWhereInput = {
        store_id,
        ...(status === "active" && { is_active: true }),
        ...(status === "inactive" && { is_active: false }),
        // when status === "all", is_active is omitted so both active & inactive are returned
        ...(category_id && { category_id }),
        ...(search && { name: { contains: search, mode: "insensitive" } }),
      };

      let products: ProductWithRelations[];
      const total = await prisma.product.count({ where });

      if (isPriceSort) {
        const priceDirection = sort === "price_asc" ? "asc" : "desc";
        const priceRows = await prisma.productPrice.findMany({
          where: { product: where },
          orderBy: { amount: priceDirection },
          skip,
          take: limit,
          select: { product_id: true },
        });

        const orderedIds = priceRows.map((r) => r.product_id);
        const fetched = await prisma.product.findMany({
          where: { id: { in: orderedIds } },
          include: { category: true, productImages: true, prices: true },
        });
        const map = new Map(fetched.map((p) => [p.id, p]));
        products = orderedIds
          .map((id) => map.get(id))
          .filter((p): p is ProductWithRelations => p !== undefined);
      } else {
        products = await prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: buildOrderBy(sort),
          include: { category: true, productImages: true, prices: true },
        });
      }

      const totalPages = Math.ceil(total / limit);

      const responsePayload = {
        data: products.map(serializeProduct),
        pagination: {
          total_items: total,
          total_pages: totalPages,
          current_page: page,
          limit,
          has_next_page: page < totalPages,
          has_prev_page: page > 1,
        },
      };

      await redis.set(
        cacheKey,
        JSON.stringify(responsePayload),
        "EX",
        PRODUCTS_CACHE_TTL,
      );

      return res.status(200).json({
        success: true,
        message: "Store products fetched successfully",
        ...responsePayload,
      });
    } catch (error) {
      console.error("Problem fetching store products:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error fetching store products" });
    }
  },
);

// update product route
router.patch(
  "/products/:product_id",
  authenticateAndVerifyCsrf,
  requireStorePermission("MANAGE_PRODUCTS"),
  upload.fields([{ name: "product_images", maxCount: 5 }]),
  validateProductUpdateInput,
  uploadProductImagesToCloudinary,
  async (req: Request, res: Response) => {
    try {
      const storeId = Number(req.query.id);
      const productId = Number(req.params.product_id);

      const existingProduct = await prisma.product.findFirst({
        where: {
          id: productId,
          store_id: storeId,
        },
        include: {
          prices: true,
          productImages: true,
        },
      });

      if (!existingProduct) {
        await cleanupProductImages(req);
        return res.status(404).json({
          success: false,
          message: "Product not found in this store",
        });
      }

      // Check slug conflict if slug is being updated
      if (req.body.slug && req.body.slug !== existingProduct.slug) {
        const slugConflict = await prisma.product.findFirst({
          where: {
            store_id: storeId,
            slug: req.body.slug,
            NOT: { id: productId },
          },
        });

        if (slugConflict) {
          await cleanupProductImages(req);
          return res.status(409).json({
            success: false,
            message: "Another product in this store already uses this slug",
          });
        }
      }

      // Check SKU conflict if SKU is being updated
      if (req.body.sku && req.body.sku !== existingProduct.sku) {
        const skuConflict = await prisma.product.findFirst({
          where: {
            store_id: storeId,
            sku: req.body.sku,
            NOT: { id: productId },
          },
        });

        if (skuConflict) {
          await cleanupProductImages(req);
          return res.status(409).json({
            success: false,
            message: "Another product in this store already uses this SKU",
          });
        }
      }

      // Check category existence if category_id is being updated
      const categoryIdToUse =
        req.body.category_id ??
        (req.query.category_id ? Number(req.query.category_id) : undefined);

      if (categoryIdToUse && categoryIdToUse !== existingProduct.category_id) {
        const category = await prisma.category.findFirst({
          where: {
            id: categoryIdToUse,
            store_id: storeId,
          },
        });

        if (!category) {
          await cleanupProductImages(req);
          return res.status(404).json({
            success: false,
            message: "Selected category does not exist in this store",
          });
        }
      }

      // Update in transaction: images, prices, scalar fields
      const updatedProduct = await prisma.$transaction(async (tx) => {
        // 1. Delete requested images if specified
        if (req.body.delete_image_ids?.length) {
          await tx.productImages.deleteMany({
            where: {
              id: { in: req.body.delete_image_ids },
              product_id: productId,
            },
          });
        }

        // 2. Add new uploaded images if any
        const uploadedImages = req.cloudinaryUploads?.product_images ?? [];
        if (uploadedImages.length > 0) {
          await tx.productImages.createMany({
            data: uploadedImages.map((image) => ({
              product_id: productId,
              image_url: image.secure_url,
              alt_text: req.body.name ?? existingProduct.name,
            })),
          });
        }

        // 3. Update prices if provided
        if (req.body.prices?.length) {
          await tx.productPrice.deleteMany({
            where: { product_id: productId },
          });

          await tx.productPrice.createMany({
            data: req.body.prices.map((p: Product_prices) => ({
              product_id: productId,
              currency: p.currency,
              amount: convertToMinorUnit(p.amount),
            })),
          });
        }

        // 4. Update product fields
        const updateData: ProductUncheckedUpdateInput = {};
        if (req.body.name !== undefined) updateData.name = req.body.name;
        if (req.body.slug !== undefined) updateData.slug = req.body.slug;
        if (req.body.description !== undefined)
          updateData.description = req.body.description;
        if (req.body.sku !== undefined) updateData.sku = req.body.sku;
        if (req.body.stock_quantity !== undefined)
          updateData.stock_quantity = req.body.stock_quantity;
        if (req.body.is_active !== undefined)
          updateData.is_active = req.body.is_active;
        if (categoryIdToUse !== undefined)
          updateData.category_id = categoryIdToUse;

        return tx.product.update({
          where: { id: productId },
          data: updateData,
          include: {
            category: true,
            productImages: true,
            prices: true,
          },
        });
      });

      // Invalidate Redis cache for this store and general product listings
      await invalidateProductsCache(storeId);

      return res.status(200).json({
        success: true,
        message: "Product updated successfully",
        data: serializeProduct(updatedProduct),
      });
    } catch (err) {
      await cleanupProductImages(req);
      console.error("Problem updating product:", err);
      return res.status(500).json({
        success: false,
        message: "Error updating product",
      });
    }
  },
);

export default router;
