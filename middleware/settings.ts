import * as z from "zod";
import { type Request, type Response, type NextFunction } from "express";
import { cloudinary } from "../lib/cloudinanry.js";
import type { UploadApiResponse } from "cloudinary";
import { CloudinaryRequest } from "../utils/types/index.js";
import multer from "multer";

const validateSettingsInput = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const input = z
      .object({
        cover_image: z.file(),
        bg_mode: z.string(),
        shipping_addresses: z.array(z.string()),
      })
      .partial();

    const result = input.safeParse(req.body);

    console.log(req.body, "is req body");
    console.log(req.file, "is req file");
    console.log(req.headers["content-type"], "is content type");

    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Something went with settings input validation:", err);
    return res
      .status(500)
      .json({ success: false, message: "failed to validate settings input" });
  }
};

const uploadProfileCoverToCloudinary = async (
  req: CloudinaryRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      return next();
    }

    const user = req.user;

    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const uploadResult = await new Promise<UploadApiResponse>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `SPECTRECOMMERCE/${user.username}/profile`,
            public_id: "cover-image",
            resource_type: "image",
            overwrite: true,
            invalidate: true,
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
          },
          (error, result) => {
            if (error) return reject(error);

            if (!result) {
              return reject(new Error("Cloudinary returned no upload result"));
            }

            resolve(result);
          },
        );

        if (req.file) uploadStream.end(req?.file.buffer);
      },
    );

    req.cloudinaryUpload = uploadResult;

    next();
  } catch (error) {
    console.error("Cloudinary profile image upload failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to upload profile cover image",
    });
  }
};

export { validateSettingsInput, uploadProfileCoverToCloudinary };
