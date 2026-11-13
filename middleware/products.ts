import type { Request, Response, NextFunction } from "express";
import * as z from "zod";
import { CloudinaryRequest } from "../utils/types/index.js";
import { UploadApiResponse } from "cloudinary";
import sharp from "sharp";
import { cloudinary } from "../lib/cloudinanry.js";
import { uploadToCloudinary } from "../utils/functions/index.js";
import type { Currency } from "../generated/prisma/enums.js";

const parsePrices = (value: unknown) => {
  if (typeof value !== "string") return value;

  try {
    const parsed = JSON.parse(value);

    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    return value;
  }
};

const priceAmountSchema = z
  .string()
  .trim()
  .regex(
    /^\d+(\.\d{1,2})?$/,
    "Price must be a valid amount with no more than 2 decimal places",
  )
  .refine((value) => {
    const [whole, fraction = ""] = value.split(".");
    const minorAmount = BigInt(`${whole}${fraction.padEnd(2, "0")}`);

    return minorAmount > 0n;
  }, "Price must be greater than zero");

const validateProductCreateInput = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z.object({
      name: z.string().trim().min(1, "Product name is required"),

      slug: z.string().trim().min(1, "Product slug is required"),

      description: z.string().trim().min(1, "Product description is required"),

      sku: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().trim().optional(),
      ),

      is_active: z.preprocess((value) => {
        if (value === "true") return true;
        if (value === "false") return false;
        return value;
      }, z.boolean().default(false)),

      stock_quantity: z.preprocess(
        (value) =>
          typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : value,
        z.number().int().min(0),
      ),

      prices: z.preprocess(
        parsePrices,
        z
          .array(
            z.object({
              currency: z
                .enum(["NAIRA", "DOLLAR"])
                .transform((value) => value as Currency),

              amount: priceAmountSchema,
            }),
          )
          .min(1, "At least one price is required")
          .refine(
            (items) =>
              new Set(items.map((item) => item.currency)).size === items.length,
            "Duplicate currencies are not allowed",
          ),
      ),
    });

    const result = inputSchema.safeParse(req.body);

    const storeIdParam = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(req.query.id);

    const categoryIdParam = z.coerce
      .number()
      .int()
      .positive()
      .safeParse(req.query.category_id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    if (!storeIdParam.success || !categoryIdParam.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing query parameters",
      });
    }

    const files = Array.isArray(req.files)
      ? req.files
      : (req.files?.product_images ?? []);

    if (files.length < 1) {
      return res.status(400).json({
        success: false,
        message: "Add at least one product image",
      });
    }

    if (files.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum of 5 product images allowed",
      });
    }

    req.body = result.data;

    next();
  } catch (err) {
    console.error("Problem validating product creation input:", err);

    return res.status(500).json({
      success: false,
      message: "Problem validating product creation inputs",
    });
  }
};

const uploadProductImagesToCloudinary = async (
  req: CloudinaryRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const storeId = Number(req.query.id);
    const categoryId = Number(req.query.category_id);

    const files = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files ?? {}).flat();

    if (!files.length) return next();

    if (!storeId || !categoryId) {
      return res.status(400).json({
        success: false,
        message: "Store ID and product ID are required",
      });
    }

    const uploadedFiles: Record<string, UploadApiResponse[]> = {};

    const folder = `SPECTRECOMMERCE/${user.username}/store/${storeId}/products/${categoryId}`;

    let imageCounter = 0;

    for (const file of files) {
      // Supports individual image replacement using product_image_2, etc.
      const replacementMatch = file.fieldname.match(/^product_image_(\d+)$/);

      let imageIndex: number;

      if (replacementMatch) {
        imageIndex = Number(replacementMatch[1]);
      } else if (file.fieldname === "product_images") {
        imageIndex = ++imageCounter;
      } else {
        return res.status(400).json({
          success: false,
          message: `Invalid image field: ${file.fieldname}`,
        });
      }

      if (imageIndex < 1 || imageIndex > 5) {
        return res.status(400).json({
          success: false,
          message: "Product images must have an index between 1 and 5",
        });
      }

      const optimizedBuffer = await sharp(file.buffer)
        .rotate()
        .resize({
          width: 920,
          height: 920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();

      const publicId = `product_${categoryId}-${imageIndex}`;

      const uploadResult = await uploadToCloudinary(
        optimizedBuffer,
        folder,
        publicId,
      );

      if (!uploadedFiles[file.fieldname]) {
        uploadedFiles[file.fieldname] = [];
      }

      uploadedFiles[file.fieldname].push(uploadResult);
    }

    req.cloudinaryUploads = uploadedFiles;

    return next();
  } catch (error) {
    console.error("Cloudinary product image upload failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload product images",
    });
  }
};

export const deleteCloudinaryImages = async (images: UploadApiResponse[]) => {
  const results = await Promise.allSettled(
    images.map((image) =>
      cloudinary.uploader.destroy(image.public_id, {
        resource_type: "image",
        invalidate: true,
      }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `Failed to delete Cloudinary image: ${images[index].public_id}`,
        result.reason,
      );
    }
  });
};

const cleanupProductImages = async (req: Request) => {
  const images = Object.values(req.cloudinaryUploads ?? {}).flat();

  if (images.length) {
    await deleteCloudinaryImages(images);
  }
};

export {
  validateProductCreateInput,
  uploadProductImagesToCloudinary,
  cleanupProductImages,
};
