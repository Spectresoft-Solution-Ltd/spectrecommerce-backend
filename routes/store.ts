import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { redis } from "../lib/redis.js";
import { authenticateAndVerifyCsrf } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  requireStorePermission,
  uploadStoreImagesToCloudinary,
  validateBankAccountInput,
  validateBankFetchQuery,
  validateCurrencyInputs,
  validateparam,
  validateProviderConfigInputs,
  validateQuery,
  validateStoreAppearanceInputs,
  validateStoreInput,
} from "../middleware/store.js";
import {
  BankAccouts,
  Members,
  PaymentProviders,
} from "../utils/types/store.js";
import { encryptData } from "../utils/algorithm/index.js";
import { upload } from "../lib/multer.js";
import multer from "multer";
import { Currency } from "../generated/prisma/enums.js";

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
        members = [],
        bank_accounts = [],
        payment_providers = [],
        default_currency,
        currencies = [],
      } = req.body;

      const foundSlug = await prisma.store.findUnique({ where: { slug } });

      if (foundSlug)
        return res
          .status(403)
          .json({ success: false, message: "Store was previously created" });

      const creator = await prisma.user.findUnique({
        where: { username: user.username },
      });

      if (!creator)
        return res
          .status(404)
          .json({ success: false, message: "Creator not found" });

      const cacheKey = `redis_store:${user.username}`;

      const workers = members.length
        ? await prisma.user.findMany({
            where: {
              username: {
                in: members.map((member: Members) => member.username),
              },
            },
          })
        : [];

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

      const encryptedProvider = payment_providers.map(
        (provider: PaymentProviders) => ({
          ...provider,
          secret_key: encryptData(provider.secret_key),
        }),
      );

      await prisma.store.create({
        data: {
          name,
          description,
          slug,
          storeCurrencies: currencies,
          default_currency,
          storeMemberships: {
            create: constructedMembers.map((member) => ({
              role: member.role,
              user: {
                connect: {
                  username: member.username,
                },
              },
            })),
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
          .json({ message: "Fetch successful", data: JSON.parse(cachedStore) });

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
  "/store/:id",
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

      const cacheKey = `redis_store:${user.username}:${storeId}`;

      const cachedStore = await redis.get(cacheKey);

      if (cachedStore)
        return res
          .status(200)
          .json({ message: "Fetch successful", data: JSON.parse(cachedStore) });

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

router.patch(
  "/store/settings/appearance",
  authenticateAndVerifyCsrf,
  upload.fields([
    { name: "cover_bg", maxCount: 5 },
    { name: "logo", maxCount: 1 },
  ]),
  validateStoreAppearanceInputs,
  uploadStoreImagesToCloudinary,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required!",
        });
      }

      const storeId = Number(req.query.id);

      if (!Number.isInteger(storeId) || storeId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid store ID",
        });
      }

      const cacheKey = `redis_store:${user.username}:${storeId}`;

      // Verify store ownership/membership
      const store = await prisma.store.findFirst({
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
      });

      if (!store) {
        return res.status(404).json({
          success: false,
          message: "Store not found",
        });
      }

      const { bg_mode, background_color } = req.body;

      const coverImages = req.cloudinaryUploads?.cover_bg ?? [];

      const logoUrl = req.cloudinaryUploads?.logo?.[0]?.secure_url;

      const coverImageUrls = coverImages.map((image) => image.secure_url);

      // Only update fields explicitly provided
      const appearanceData = {
        ...(coverImages.length > 0 && {
          cover_images: coverImageUrls,
        }),
        ...(logoUrl && {
          logo_url: logoUrl,
        }),
        ...(bg_mode !== undefined && {
          bg_mode,
        }),
        ...(background_color !== undefined && {
          background_color,
        }),
      };

      await prisma.storeAppearance.upsert({
        where: {
          store_id: storeId,
        },
        update: appearanceData,
        create: {
          store_id: storeId,
          cover_images: coverImageUrls,
          logo_url: logoUrl ?? null,
          bg_mode: bg_mode ?? "light",
          background_color: background_color ?? null,
        },
      });

      // Invalidate store cache
      await redis.del(cacheKey);

      return res.status(200).json({
        success: true,
        message: "Store appearance updated successfully",
      });
    } catch (err) {
      console.error("Error setting store appearance:", err);

      return res.status(500).json({
        success: false,
        message: "Problem updating store appearance settings",
      });
    }
  },
);

router.get(
  "/store/settings/appearance",
  authenticateAndVerifyCsrf,
  validateQuery,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required!" });

      const { id } = req.query;
      const storeId = Number(id);

      const cacheKey = `redis_store_appearance:${storeId}`;

      const cachedAppearance = await redis.get(cacheKey);

      if (cachedAppearance)
        return res.status(200).json({
          message: "Fetch successful",
          success: true,
          data: cachedAppearance,
        });

      const foundApearance = await prisma.storeAppearance.findFirst({
        where: { store_id: storeId },
      });

      await redis.set(
        cacheKey,
        JSON.stringify(foundApearance),
        "EX",
        4 * 60 * 60,
      );

      return res.status(200).json({
        message: "Fetch successful",
        success: true,
        data: foundApearance,
      });
    } catch (err) {
      console.error("Error setting store appearance");
      return res.status(500).json({
        success: false,
        message: "Problem fetching store appearance settings",
      });
    }
  },
);

router.patch(
  "/store/settings/bankaccounts",
  authenticateAndVerifyCsrf,
  requireStorePermission("UPDATE_STORE_BANK_ACCOUNTS"),
  validateBankAccountInput,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required!",
        });
      }

      const storeId = Number(req.query.id);
      const { bank_accounts = [] } = req.body;
      const cacheKey = `redis_store_bankAC:${user.sub}:${storeId}`;

      if (!Number.isInteger(storeId) || storeId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid store ID",
        });
      }

      // Verify store membership
      const membership = await prisma.storeMembership.findFirst({
        where: {
          store_id: storeId,
          user_id: Number(user.sub),
        },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You don't have access to this store",
        });
      }

      // Update existing accounts or create new ones
      await prisma.$transaction(
        bank_accounts.map((item: BankAccouts) => {
          const { bank_id, ...data } = item;

          if (bank_id) {
            return prisma.storeBankAccount.updateMany({
              where: {
                id: Number(bank_id),
                store_id: storeId,
              },
              data,
            });
          }

          return prisma.storeBankAccount.create({
            data: {
              ...data,
              store_id: storeId,
            },
          });
        }),
      );

      await redis.del(cacheKey);

      return res.status(200).json({
        success: true,
        message: "Store bank details updated successfully",
      });
    } catch (err) {
      console.error("Error updating store bank accounts:", err);

      return res.status(500).json({
        success: false,
        message: "Problem updating store bank accounts",
      });
    }
  },
);

router.get(
  "/store/settings/bankaccounts",
  authenticateAndVerifyCsrf,
  validateBankFetchQuery,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;

      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required!" });

      const { id } = req.query;
      const storeId = Number(id);

      const cacheKey = `redis_store_bankAC:${user.sub}:${storeId}`;
      const cachedBankSettings = await redis.get(cacheKey);

      if (cachedBankSettings)
        return res.status(200).json({
          success: true,
          message: "store banks fetch successful",
          data: JSON.parse(cachedBankSettings),
        });

      const foundBankSettings = await prisma.store.findFirst({
        where: {
          id: storeId,
          storeMemberships: {
            some: {
              user_id: Number(user.sub),
            },
          },
        },
        select: {
          bankAccounts: true,
        },
      });

      if (!foundBankSettings)
        return res
          .status(404)
          .json({ success: false, message: "Bank settings not found" });

      await redis.set(
        cacheKey,
        JSON.stringify(foundBankSettings),
        "EX",
        4 * 60 * 60,
      );

      return res.status(200).json({
        message: "Fetch successful",
        success: true,
        data: foundBankSettings,
      });
    } catch (err) {
      console.error("Error fetching store banks:", err);
      return res
        .status(500)
        .json({ success: false, message: "Problem fetching store banks" });
    }
  },
);

router.patch(
  "/store/settings/currency",
  authenticateAndVerifyCsrf,
  requireStorePermission("UPDATE_STORE_CURRENCIES"),
  validateCurrencyInputs,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required!" });

      const { id } = req.query;
      const { default_currency, currencies = [] } = req.body;
      const storeId = Number(id);
      const cacheKey = `redis_store:${user.username}:${storeId}`;

      await prisma.store.update({
        where: {
          id: storeId,
          storeMemberships: {
            some: {
              user_id: Number(user.sub),
            },
          },
        },
        data: {
          default_currency,
          storeCurrencies: {
            createMany: {
              data: currencies.map((currency: Currency) => ({
                currency,
              })),
              skipDuplicates: true,
            },
          },
        },
      });

      await redis.del(cacheKey);

      return res.status(200).json({
        success: true,
        message: "store currencies updated successfully",
      });
    } catch (err) {
      console.error("Problem setting store currency:", err);
      return res
        .status(500)
        .json({ success: false, message: "Problem setting store currency!" });
    }
  },
);

router.patch(
  "/store/settings/providers",
  authenticateAndVerifyCsrf,
  requireStorePermission("UPDATE_STORE_BANK_ACCOUNTS"),
  validateProviderConfigInputs,
  async (req: Request, res: Response) => {
    try {
      const user = req.user;
      if (!user)
        return res
          .status(401)
          .json({ success: false, message: "Authentication required!" });

      const { payment_providers = [] } = req.body;
      const { id } = req.query;
      const storeId = Number(id);

      await prisma.$transaction(
        payment_providers.map((provider: PaymentProviders) => {
          const { id, secret_key, ...data } = provider;

          if (id) {
            return prisma.storePaymentProvider.updateMany({
              where: {
                id: Number(id),
                store_id: storeId,
              },
              data: {
                ...data,
                ...(secret_key && {
                  secret_key: encryptData(secret_key),
                }),
              },
            });
          }

          return prisma.storePaymentProvider.create({
            data: {
              ...data,
              secret_key: secret_key ? encryptData(secret_key) : "",
              is_enabled: data.is_enabled ? true : false,
              webhook_secret: "",
              store_id: storeId,
            },
          });
        }),
      );

      return res.status(200).json({
        success: true,
        message: "store payment providers updated successfully",
      });
    } catch (err) {
      console.error("Problem configuring store provider");
      return res
        .status(500)
        .json({ message: "Problem configuring store provider" });
    }
  },
);

export default router;
