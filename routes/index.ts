import { Router } from "express";
import authRouter from "./authentication.js";

const api = Router();

api.use(authRouter);

export default api;
