import "dotenv/config";
import Jwt, { JwtPayload } from "jsonwebtoken";
import { type Request, type Response, type NextFunction } from "express";
import * as z from "zod";
import { redis } from "../lib/redis.js";
import { doubleCsrfProtection } from "../lib/doublecsrf.js";

const jwtSecret = process.env.JWT_SECRET;

export async function authenticateAndVerifyCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!jwtSecret) {
    throw new Error("JWT is not properly configured");
  }

  const token = req.cookies.access_token;

  if (!token) {
    return res.status(401).json({ message: "authentication required!" });
  }

  try {
    const decoded = Jwt.verify(token, jwtSecret);

    if (typeof decoded === "string") {
      return res.status(401).json({ message: "invalid token" });
    }

    req.user = decoded as JwtPayload;

    const validAfter =
      Number(await redis.get(`auth:valid_after:${decoded.sub}`)) || 0;
    if (!decoded.iat || decoded.iat < validAfter) {
      return res.status(401).json({ message: "token revoked" });
    }

    return doubleCsrfProtection(req, res, next);
  } catch (err) {
    console.log("issues with authentication middleware:", err);
    return res.status(401).json({ message: "invalid or expired token" });
  }
}

export function validateRegisterInput(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const registerSchema = z.object({
      username: z.string().min(4),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(
          /[^A-Za-z0-9]/,
          "Password must contain at least one special character",
        ),
      email: z.email("Enter a vlaid email address"),
      firstName: z.string().min(3, "enter your first name"),
      lastName: z.string().min(3, "enter your last name"),
    });

    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.log("issue with validation:", err);
    return res
      .status(500)
      .json({ message: "something went wrong with request" });
  }
}

export function validateLoginInput(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const loginSchema = z.object({
      identifier: z.string().min(4, "Enter a valid username or email"),
      password: z.string().min(1, "Password is required"),
    });

    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.log("issue with validation:", err);
    return res
      .status(500)
      .json({ message: "something went wrong with request" });
  }
}
