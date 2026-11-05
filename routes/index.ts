import { Router } from "express";
import authRouter from "./authentication.js";
import profileRouter from "./settings.js";

const api = Router();

api.use(authRouter);
api.use(profileRouter);

export default api;
