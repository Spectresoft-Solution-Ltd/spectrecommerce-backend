import type { JwtPayload } from "jsonwebtoken";
import type { UploadApiResponse } from "cloudinary";

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload;
  }
}

declare global {
  namespace Express {
    interface Request {
      cloudinaryUpload?: UploadApiResponse;
      cloudinaryUploads?: Record<string, UploadApiResponse[]>;
    }
  }
}
