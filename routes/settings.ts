import { Router, type Request, type Response } from "express";
import { authenticateAndVerifyCsrf } from "../middleware/auth.js";

const router = Router();

router.post(
  "/profile",
  authenticateAndVerifyCsrf,
  async (req: Request, res: Response) => {
    const user = req.user;
    console.log(user, "is req user");

    res.send("user");
  },
);

export default router;
