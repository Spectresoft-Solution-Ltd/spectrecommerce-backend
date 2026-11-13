import { Router, type Request, type Response } from "express";
import { authenticateAndVerifyCsrf } from "../middleware/auth.js";
import { requireStorePermission } from "../middleware/store.js";
import {
  cleanupProductImages,
  uploadProductImagesToCloudinary,
  validateProductCreateInput,
} from "../middleware/products.js";
import { upload } from "../lib/multer.js";
import { prisma } from "../lib/prisma.js";
import { Product_prices } from "../utils/types/products.js";
import { convertToMinorUnit } from "../utils/types/index.js";

const router = Router();

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

export default router;
