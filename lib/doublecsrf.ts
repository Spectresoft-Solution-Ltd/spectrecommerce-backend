import "dotenv/config";
import { doubleCsrf } from "csrf-csrf";

const csrfSecret = process.env.CSRF_SECRET;

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => csrfSecret || "",
  cookieName: "x-csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getSessionIdentifier: (req) => {
    return req.user?.sub ?? "";
  },
});

export { doubleCsrf, doubleCsrfProtection, generateCsrfToken };
