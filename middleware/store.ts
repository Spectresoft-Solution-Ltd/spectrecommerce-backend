import * as z from "zod";
import { type Request, type Response, type NextFunction } from "express";
import { UploadApiResponse } from "cloudinary";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { uploadToCloudinary } from "../utils/functions/index.js";
import { cloudinary } from "../lib/cloudinanry.js";
import { prisma } from "../lib/prisma.js";
import {
  ROLE_PERMISSIONS,
  StorePermission,
} from "../utils/types/permission.js";

const validateStoreInput = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z.object({
      name: z.string(),
      description: z.string(),
      slug: z.string(),
      default_currency: z.enum(["NAIRA", "DOLLAR"]).optional(),
      currencies: z
        .array(z.enum(["NAIRA", "DOLLAR"]))
        .refine(
          (currencies) => new Set(currencies).size === currencies.length,
          {
            message: "Currencies must not contain duplicates",
          },
        )
        .optional(),

      members: z
        .array(
          z.object({
            // user creating must be sent
            username: z.string().min(4),
            role: z.enum(["OWNER", "ADMIN", "STAFF"]),
          }),
        )
        .optional()
        .refine(
          (members) =>
            !members ||
            new Set(members.map((member) => member.username)).size ===
              members.length,
          { message: "Duplicate members are not allowed" },
        ),

      bank_accounts: z
        .array(
          z.object({
            bank_name: z.string(),
            account_name: z.string(),
            account_number: z.string().trim().min(1),
            is_enabled: z.boolean().default(true),
          }),
        )
        .optional(),

      payment_providers: z
        .array(
          z.object({
            provider: z.string().min(1),
            public_key: z.string().min(1),
            secret_key: z.string().min(1),
            is_enabled: z.boolean().default(true),
          }),
        )
        .optional()
        .superRefine((providers, ctx) => {
          if (!providers) return;

          const fields = ["provider", "public_key", "secret_key"] as const;

          for (const field of fields) {
            const seen = new Set<string>();

            providers.forEach((item, index) => {
              const value = item[field].trim().toLowerCase();

              if (seen.has(value)) {
                ctx.addIssue({
                  code: "custom",
                  message: `Duplicate ${field} is not allowed`,
                  path: [index, field],
                });
              }

              seen.add(value);
            });
          }
        }),
    });

    const result = inputSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    req.body = result.data;

    next();
  } catch (err) {
    console.error("Error validating store input:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate store inputs",
    });
  }
};

const validateparam = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = z.string().safeParse(req.params.id);

    if (!result.success) {
      return res.status(400).json({
        message: "query parameter missing",
        errors: z.treeifyError(result.error),
      });
    }

    next();
  } catch (err) {
    console.error("Error validating store input:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate store param",
    });
  }
};

const validateQuery = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = z.string().safeParse(req.query.id);

    if (!result.success) {
      return res.status(400).json({
        message: "query parameter missing",
        errors: z.treeifyError(result.error),
      });
    }

    next();
  } catch (err) {
    console.error("Error validating store input:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate store param",
    });
  }
};

const validateStoreAppearanceInputs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z
      .object({
        cover_bg: z.array(z.file()).min(1).max(5),
        logo: z.file(),
        bg_mode: z.enum(["light", "dark"]),
        background_color: z.string(),
      })
      .partial();

    const param = z.string().safeParse(req.query.id);

    const result = inputSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }
    if (!param.success) {
      return res.status(400).json({
        message: "query parameter missing",
        errors: z.treeifyError(param.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Error validating store appearance inputs:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate store appearance inputs",
    });
  }
};

export interface CloudinaryRequest extends Request {
  cloudinaryUpload?: UploadApiResponse;
}

const uploadStoreImagesToCloudinary = async (
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

    const files = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files ?? {}).flat();

    if (!files.length) return next();

    const uploadedFiles: Record<string, UploadApiResponse[]> = {};

    const folder = `SPECTRECOMMERCE/${user.username}/store/${storeId}`;

    const counters: Record<string, number> = {};

    for (const file of files) {
      counters[file.fieldname] = (counters[file.fieldname] ?? 0) + 1;

      const imageIndex = counters[file.fieldname];

      const optimizedBuffer = await sharp(file.buffer)
        .rotate()
        .resize({
          width: file.fieldname === "logo" ? 600 : 1920,
          height: file.fieldname === "logo" ? 600 : 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();

      const publicId =
        file.fieldname === "logo" ? "logo" : `cover_bg-${imageIndex}`;

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

    // Remove unused previous cover image slots when replacing the collection.
    if (counters.cover_bg) {
      for (let i = counters.cover_bg + 1; i <= 5; i++) {
        await cloudinary.uploader.destroy(`${folder}/cover_bg-${i}`, {
          resource_type: "image",
        });
      }
    }

    req.cloudinaryUploads = uploadedFiles;

    return next();
  } catch (error) {
    console.error("Cloudinary store image upload failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload store images",
    });
  }
};

const validateBankAccountInput = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z.object({
      bank_accounts: z
        .array(
          z.object({
            bank_id: z.number().optional(),
            bank_name: z.string().trim().min(1, "Bank name is required"),
            account_name: z.string().trim().min(1, "Account name is required"),
            account_number: z
              .string()
              .trim()
              .min(1, "Account number is required"),
            is_enabled: z.boolean().default(true),
          }),
        )
        .min(1, "At least one bank account is required"),
    });

    const paramSchema = z.object({
      id: z.string(),
    });

    const result = inputSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    const param = paramSchema.safeParse(req.query);

    if (!param.success)
      return res.status(400).json({
        message: "query parameter missing",
        errors: z.treeifyError(param.error),
      });

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Error validating bank account input:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate bank accounts inputs",
    });
  }
};

const validateBankFetchQuery = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = z.string();
    const result = query.safeParse(req.query.id);

    if (!result.success) {
      return res.status(400).json({
        message: "query parameter missing",
        errors: z.treeifyError(result.error),
      });
    }

    next();
  } catch (err) {
    console.error("Problem validating bank fetch query:", err);
    return res.status(500).json({
      success: false,
      message: "failed to validate bank account query",
    });
  }
};

const validateCurrencyInputs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z
      .object({
        default_currency: z.enum(["NAIRA", "DOLLAR"]).optional(),
        currencies: z
          .array(z.enum(["NAIRA", "DOLLAR"]))
          .refine((values) => new Set(values).size === values.length, {
            message: "Duplicate currencies are not allowed",
          })
          .optional(),
      })
      .refine(
        (data) =>
          data.default_currency !== undefined || data.currencies !== undefined,
        {
          message: "At least one currency field must be provided",
        },
      );

    const result = inputSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    const param = z.string().safeParse(req.query.id);
    if (!param.success) {
      return res.status(400).json({
        message: "query parameter missing",
        errors: z.treeifyError(param.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Problem validating bank currency");
    return res
      .status(500)
      .json({ success: false, message: "Failed to validate currency inputs" });
  }
};

const validateProviderConfigInputs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z
      .array(
        z.object({
          id: z.string().optional(),
          provider: z.string().min(1),
          public_key: z.string().min(1),
          secret_key: z.string().min(1),
          is_enabled: z.boolean().default(true),
        }),
      )
      .min(1, "add a payment configuration");

    const result = inputSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    const param = z.string().safeParse(req.query.id);
    if (!param.success) {
      return res.status(400).json({
        message: "iquery parameter missing",
        errors: z.treeifyError(param.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Problem validating store payment config:", err);
    res.status(500).json({
      message: "Problem validation store payment config inputs",
      success: false,
    });
  }
};

const validateBankAccountDeleteInput = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z.object({
      ids: z
        .array(z.number())
        .min(1, "include a bank account id")
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "Duplicate bank account IDs are not allowed",
        }),
    });

    const result = inputSchema.safeParse(req.body);
    const param = z.string().safeParse(req.query.id);

    if (!param.success)
      return res.status(400).json({
        message: "query parameter missing!",
        errors: z.treeifyError(param.error),
      });

    if (!result.success)
      return res.status(400).json({
        message: "Invalid or missing request body",
        errors: z.treeifyError(result.error),
      });

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Problem validating bank account delete inputs");
    return res.status(500).json({
      success: false,
      message: "Problem validating bank account delete inputs",
    });
  }
};

const validateProviderConfigInput = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z.object({
      ids: z
        .array(z.number())
        .min(1, "add a payment configuration id")
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "Duplicate provider IDs are not allowed",
        }),
    });

    const result = inputSchema.safeParse(req.body);
    const param = z.string().safeParse(req.query.id);

    if (!param.success)
      return res.status(400).json({
        message: "query parameter missing!",
        errors: z.treeifyError(param.error),
      });

    if (!result.success)
      return res.status(400).json({
        message: "Invalid or missing request body",
        errors: z.treeifyError(result.error),
      });

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Problem validating provider configuration inputs");
    return res.status(500).json({
      success: false,
      message: "Problem validating provider configuration inputs",
    });
  }
};

const requireStorePermission = (permission: StorePermission) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const user_id = Number(user.sub);
      const store_id = Number(req.query.id);

      if (!store_id || store_id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid store ID",
        });
      }

      const membership = await prisma.storeMembership.findFirst({
        where: {
          user_id,
          store_id,
        },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this store",
        });
      }

      const permissions = ROLE_PERMISSIONS[membership.role];

      if (!permissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to perform this action",
        });
      }

      // Make membership available to subsequent handlers
      res.locals.storeMembership = membership;

      next();
    } catch (err) {
      console.error("Permission verification failed:", err);

      return res.status(500).json({
        success: false,
        message: "Failed to verify user permissions",
      });
    }
  };
};

export {
  validateStoreInput,
  validateparam,
  validateStoreAppearanceInputs,
  uploadStoreImagesToCloudinary,
  validateQuery,
  requireStorePermission,
  validateBankAccountInput,
  validateBankFetchQuery,
  validateCurrencyInputs,
  validateProviderConfigInputs,
  validateBankAccountDeleteInput,
  validateProviderConfigInput,
};
