import * as z from "zod";
import { type Request, type Response, type NextFunction } from "express";

const validateStoreInput = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const inputSchema = z.object({
      name: z.string(),
      description: z.string(),
      slug: z.string(),

      members: z
        .array(
          z.object({
            // user creating must be sent
            username: z.string().min(4),
            role: z.enum(["OWNER", "ADMIN", "STAFF"]),
          }),
        )
        .optional()
        .refine(
          (members) =>
            !members ||
            new Set(members.map((member) => member.username)).size ===
              members.length,
          { message: "Duplicate members are not allowed" },
        ),

      bank_accounts: z
        .object({
          bank_name: z.string(),
          account_name: z.string(),
          account_number: z.number(),
          is_enabled: z.boolean().default(true),
        })
        .optional(),

      payment_providers: z
        .array(
          z.object({
            provider: z.string().min(1),
            public_key: z.string().min(1),
            secret_key: z.string().min(1),
            is_enabled: z.boolean().default(true),
          }),
        )
        .optional()
        .superRefine((providers, ctx) => {
          if (!providers) return;

          const fields = ["provider", "public_key", "secret_key"] as const;

          for (const field of fields) {
            const seen = new Set<string>();

            providers.forEach((item, index) => {
              const value = item[field].trim().toLowerCase();

              if (seen.has(value)) {
                ctx.addIssue({
                  code: "custom",
                  message: `Duplicate ${field} is not allowed`,
                  path: [index, field],
                });
              }

              seen.add(value);
            });
          }
        }),
    });

    const result = inputSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    req.body = result.data;

    next();
  } catch (err) {
    console.error("Error validating store input:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate store inputs",
    });
  }
};

const validateparam = (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = z.number().safeParse(req.body.id);

    if (!result.success) {
      return res.status(400).json({
        message: "invalid or missing request body",
        errors: z.treeifyError(result.error),
      });
    }

    req.body = result.data;
    next();
  } catch (err) {
    console.error("Error validating store input:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to validate store param",
    });
  }
};

export { validateStoreInput, validateparam };
