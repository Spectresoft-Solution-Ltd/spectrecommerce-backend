import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import "dotenv/config";
import cookieParser from "cookie-parser";
import { doubleCsrfProtection, invalidCsrfTokenError } from "./lib/doublecsrf.js";
import api from "./routes/index.js";

const app = express();

app.use(cookieParser());

app.use(express.json());

// app.use(doubleCsrfProtection);

app.use(api);

const port = Number(process.env.PORT ?? 3000);

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err === invalidCsrfTokenError) {
    return res.status(403).json({ message: "invalid csrf token" });
  }
  next(err);
});

app.use((_req, res) => res.status(404).json({ message: "not found" }));

app.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log("Action successful at get route");
    res.send("Hell get");
  } catch (err) {
    console.error(`Failed to fect details from route: ${err}`);
  }
});

async function start() {
  try {
    await prisma.$connect();
    await redis.ping();

    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exitCode = 1;
  }
}

void start();
