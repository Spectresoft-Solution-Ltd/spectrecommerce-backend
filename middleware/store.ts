import * as z from "zod";
import { type Request, type Response, type NextFunction } from "express";
import { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../lib/cloudinanry.js";
import { randomUUID } from "node:crypto";

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

    // Supports both upload.array() and upload.fields()
    const files = Array.isArray(req.files)
      ? req.files
      : Object.values(req.files ?? {}).flat();

    if (!files.length) {
      return next();
    }

    const uploadedFiles: Record<string, UploadApiResponse[]> = {};

    for (const file of files) {
      const publicId = `${file.fieldname}-${randomUUID()}`;

      const uploadResult = await new Promise<UploadApiResponse>(
        (resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: `SPECTRECOMMERCE/${user.username}/store`,
              public_id: publicId,
              resource_type: "image",
              overwrite: false,
              invalidate: true,
              allowed_formats: ["jpg", "jpeg", "png", "webp"],
            },
            (error, result) => {
              if (error) return reject(error);

              if (!result) {
                return reject(
                  new Error("Cloudinary returned no upload result"),
                );
              }

              resolve(result);
            },
          );

          uploadStream.end(file.buffer);
        },
      );

      if (!uploadedFiles[file.fieldname]) {
        uploadedFiles[file.fieldname] = [];
      }

      uploadedFiles[file.fieldname].push(uploadResult);
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
export {
  validateStoreInput,
  validateparam,
  validateStoreAppearanceInputs,
  uploadStoreImagesToCloudinary,
};
