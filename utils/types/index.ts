import type { Request } from "express";
import { UploadApiResponse } from "cloudinary";

export interface CloudinaryRequest extends Request {
  cloudinaryUpload?: UploadApiResponse;
}

export const convertToMinorUnit = (amount: string): bigint => {
  const [whole, fraction = ""] = amount.split(".");

  return BigInt(`${whole}${fraction.padEnd(2, "0")}`);
};

export const convertFromMinorUnit = (amount: bigint): string => {
  const value = amount.toString().padStart(3, "0");

  return `${value.slice(0, -2)}.${value.slice(-2)}`;
};
