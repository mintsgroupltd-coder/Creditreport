import { Router } from "express";
import { getContacts } from "../controllers/contacts.controller";
import { requireAuth } from "../middleware/auth";
import { asyncRoute } from "../middleware/errorHandler";

export const contactsRouter = Router();

contactsRouter.use(requireAuth);
contactsRouter.get("/", asyncRoute(getContacts));
