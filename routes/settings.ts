import { Router, type Request, type Response } from "express";
import { authenticateAndVerifyCsrf } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  uploadProfileCoverToCloudinary,
  validateSettingsInput,
} from "../middleware/settings.js";
import { upload } from "../lib/multer.js";

const router = Router();

router.post(
  "/profile",
  authenticateAndVerifyCsrf,
  upload.single("cover_image"),
  validateSettingsInput,
  uploadProfileCoverToCloudinary,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      console.log(user, "is req user");

      if (!user?.exp)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });

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

export default router;
