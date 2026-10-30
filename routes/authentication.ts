import "dotenv/config";
import Jwt from "jsonwebtoken";
import { Router, type Request, type Response } from "express";
import {
  authenticateAndVerifyCsrf,
  validateLoginInput,
  validateRegisterInput,
} from "../middleware/auth.js";
import PasswordHasher from "argon2";
import { prisma } from "../lib/prisma.js";
import crypto from "node:crypto";

const router = Router();

const jwtSecret = process.env.JWT_SECRET || "";

router.post("/", validateRegisterInput, async (req: Request, res: Response) => {
  try {
    const { username, firstName, lastName, email, password } = req.body;
    const ph = await PasswordHasher.hash(password);

    await prisma.user.create({
      data: {
        first_name: firstName,
        last_name: lastName,
        email,
        username,
        password_hash: ph,
      },
    });

    return res.status(201).json({ message: "user creation successful" });
  } catch (err) {
    console.log("Eror creating user", err);
    return res.status(500).json({ message: "Error creating user" });
  }
});

router.post("/", validateLoginInput, async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const isPasswordValid = await PasswordHasher.verify(
      user.password_hash || "",
      password,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const jwtpayload = {
      sub: String(user.id),
      username: user.username,
      email: user.email,
    };

    const signedToken = Jwt.sign(jwtpayload, jwtSecret, {
      expiresIn: "1h",
    });

    res.cookie("access_token", signedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      message: "Authentication successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch (err) {
    console.error("Error on login route:", err);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
});

router.post(
  "/",
  authenticateAndVerifyCsrf,
  async (req: Request, res: Response) => {
    try {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return res.status(200).json({
        message: "Logout successful",
      });
    } catch (err) {
      console.error("Error on logout route:", err);

      return res.status(500).json({
        message: "Something went wrong",
      });
    }
  },
);
