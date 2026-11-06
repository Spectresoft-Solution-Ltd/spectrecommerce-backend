import { Router } from "express";
import authRouter from "./authentication.js";
import profileRouter from "./settings.js";
import storeRouter from "./store.js";

const api = Router();

api.use(authRouter);
api.use(profileRouter);
api.use(storeRouter);

export default api;
