import { Router } from "express";
import { login, register } from "../controllers/auth.controller";
import { asyncRoute } from "../middleware/errorHandler";

export const authRouter = Router();

authRouter.post("/register", asyncRoute(register));
authRouter.post("/login", asyncRoute(login));
