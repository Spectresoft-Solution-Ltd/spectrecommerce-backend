import { Router, type Request, type Response } from "express";
import { authenticateAndVerifyCsrf } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  uploadProfileCoverToCloudinary,
  validateSettingsInput,
} from "../middleware/settings.js";
import { upload } from "../lib/multer.js";
import { redis } from "../lib/redis.js";

const router = Router();

router.patch(
  "/profile",
  authenticateAndVerifyCsrf,
  upload.single("cover_image"),
  validateSettingsInput,
  uploadProfileCoverToCloudinary,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user?.exp)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });

      const cacheKey = `redis_profile:${user.username}`;

      const foundUser = await prisma.user.findFirst({
        where: {
          username: user.username,
        },
      });

      if (!foundUser)
        return res
          .status(404)
          .json({ success: false, message: "user not found" });

      console.log(req.body, "is req body");
      console.log(req.file, "is req file");
      console.log(req.headers["content-type"], "is content type");

      const profileData = {
        ...req.body,
        ...(req.cloudinaryUpload && {
          cover_image: req.cloudinaryUpload.secure_url,
        }),
      };

      await prisma.profile.upsert({
        where: {
          user_id: foundUser.id,
        },
        update: profileData,
        create: {
          user_id: foundUser.id,
          ...profileData,
        },
      });

      try {
        await redis.del(cacheKey);
      } catch (redisError) {
        console.error("Redis cache invalidation failed:", redisError);
      }

      return res
        .status(200)
        .json({ success: true, message: "Profile update successful" });
    } catch (err) {
      console.error("Something went wrong updating profile:", err);
      return res
        .status(500)
        .json({ success: false, message: "Error updating profile settings" });
    }
  },
);

router.get(
  "/profile",
  authenticateAndVerifyCsrf,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });

      const cacheKey = `redis_profile:${user.username}`;

      const cachedProfile = await redis.get(cacheKey);

      if (cachedProfile)
        return res.status(200).json({
          message: "fetch successful",
          success: true,
          data: JSON.parse(cachedProfile),
        });

      const foundProfile = await prisma.user.findUnique({
        where: { username: user.username },
        include: { profiles: true },
      });

      const profile = foundProfile?.profiles[0];

      if (!profile)
        return res
          .status(404)
          .json({ success: false, message: "user profile not found" });

      const profileData = {
        cover_image: profile.cover_image,
        bg_mode: profile.bg_mode,
        shipping_addresses: profile.shipping_addresses,
      };

      await redis.set(cacheKey, JSON.stringify(profileData), "EX", 4 * 60 * 60);

      return res.status(200).json({
        success: true,
        message: "fetch successful",
        data: profileData,
      });
    } catch (err) {
      console.error("Something went wrong getting profile:", err);
      res
        .status(500)
        .json({ success: false, message: "Error fetching profile" });
    }
  },
);

export default router;
