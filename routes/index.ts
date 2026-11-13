import { Router } from "express";
import authRouter from "./authentication.js";
import profileRouter from "./settings.js";
import storeRouter from "./store.js";
import productRouter from "./products.js";

const api = Router();

api.use(authRouter);
api.use(profileRouter);
api.use(storeRouter);
api.use(productRouter);

export default api;
