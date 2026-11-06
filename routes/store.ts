import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { redis } from "../lib/redis.js";
import { authenticateAndVerifyCsrf } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { validateparam, validateStoreInput } from "../middleware/store.js";
import { Members, PaymentProviders } from "../utils/types/store.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { encryptData } from "../utils/algorithm/index.js";

const router = Router();

router.post(
  "/store",
  authenticateAndVerifyCsrf,
  validateStoreInput,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });

      const {
        slug,
        name,
        description,
        members,
        bank_accounts,
        payment_providers,
      } = req.body;

      const foundSlug = await prisma.store.findUnique({ where: { slug } });

      if (foundSlug)
        return res
          .status(403)
          .json({ success: false, message: "Store was previously created" });

      const creator = await prisma.user.findUnique({ where: user.username });

      if (!creator)
        return res
          .status(404)
          .json({ success: false, message: "Creator not found" });

      const cacheKey = `redis_store:${user.username}`;

      const workers = await prisma.user.findMany({
        where: {
          username: {
            in: members.map((member: Members) => member.username),
          },
        },
      });

      if (workers.length !== members.length) {
        return res.status(400).json({
          success: false,
          message: "One or more members do not exist",
        });
      }

      const constructedMembers = [
        {
          username: creator.username,
          role: "OWNER" as const,
        },
        ...members.map((member: Members) => ({
          username: member.username,
          role: member.role,
        })),
      ];

      const encryptedProvider = payment_providers
        ? {
            ...payment_providers,
            secret_key: encryptData(payment_providers.secret_key),
            webhook_secret: encryptData(payment_providers.webhook_secret),
          }
        : [];

      await prisma.store.create({
        data: {
          name,
          description,
          slug,
          storeMemberships: {
            create: constructedMembers,
          },
          bankAccounts: {
            create: bank_accounts,
          },
          storepaymentproviders: {
            create: encryptedProvider,
          },
        },
      });

      try {
        await redis.del(cacheKey);
      } catch (redisError) {
        console.error("Redis cache invalidation failed:", redisError);
      }

      return res
        .status(201)
        .json({ success: true, message: "Store creation sucessful" });
    } catch (err) {
      console.error("Error creating store:", err);
      return res
        .status(500)
        .json({ success: false, message: "Problem creating store" });
    }
  },
);

router.get(
  "/store",
  authenticateAndVerifyCsrf,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });

      const cacheKey = `redis_store:${user.username}`;

      const cachedStore = await redis.get(cacheKey);

      if (cachedStore)
        return res
          .status(200)
          .json({ message: "Fetch successful", data: cachedStore });

      const foundStores = await prisma.store.findMany({
        where: {
          storeMemberships: {
            some: {
              user: {
                username: user.username,
              },
            },
          },
        },
      });

      if (!foundStores || !foundStores.length)
        return res
          .status(404)
          .json({ success: false, message: "store for user not found" });

      const store = foundStores.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        slug: item.slug,
        status: item.status,
      }));

      await redis.set(cacheKey, JSON.stringify(store), "EX", 4 * 60 * 60);

      return res
        .status(200)
        .json({ success: true, message: "Fetch successful", data: store });
    } catch (err) {
      console.error("Error fetching store:, err");
      return res
        .status(500)
        .json({ success: false, message: "Problem fetching store" });
    }
  },
);

router.get(
  "/store",
  authenticateAndVerifyCsrf,
  validateparam,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required" });

      const { id } = req.params;

      const storeId = Number(id);

      const cacheKey = `redis_store:${user.username}:${id}`;

      const cachedStore = await redis.get(cacheKey);

      if (cachedStore)
        return res
          .status(200)
          .json({ message: "Fetch successful", data: cachedStore });

      const foundStore = await prisma.store.findFirst({
        where: {
          id: storeId,
          storeMemberships: {
            some: {
              user: {
                username: user.username,
              },
            },
          },
        },
        include: {
          plan: true,
          storeAppearance: true,
          storeCurrencies: true,
          storeDomains: true,
          bankAccounts: true,
          categories: true,
          products: true,
        },
      });

      if (!foundStore)
        return res
          .status(404)
          .json({ success: false, message: "store for user not found" });

      await redis.set(cacheKey, JSON.stringify(foundStore), "EX", 4 * 60 * 60);

      return res
        .status(200)
        .json({ success: true, message: "Fetch successful", data: foundStore });
    } catch (err) {
      console.error("Error fetching store details");
      return res
        .status(500)
        .json({ success: false, message: "Problem fetching store details" });
    }
  },
);

export default router;
