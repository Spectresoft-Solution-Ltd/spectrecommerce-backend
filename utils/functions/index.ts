import sharp from "sharp";
import { Readable } from "node:stream";
import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinanry.js";

export async function optimizeImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 4,
    })
    .toBuffer();
}

export const uploadToCloudinary = (
  buffer: Buffer,
  folder: string,
  publicId: string,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_chunked_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        overwrite: true,
        invalidate: true,
        chunk_size: 6 * 1024 * 1024,
        timeout: 180000,
        format: "webp",
        quality: "auto",
      },
      (error, result) => {
        if (error) return reject(error);

        if (!result) {
          return reject(new Error("Cloudinary returned no result"));
        }

        resolve(result);
      },
    );

    Readable.from([buffer]).pipe(uploadStream);
  });
};
