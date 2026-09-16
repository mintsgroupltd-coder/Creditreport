import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { BUREAU_CONTACTS, CONTACTS_LAST_VERIFIED, COURT_CONTACT } from "../data/contacts";

export async function getContacts(_req: AuthenticatedRequest, res: Response) {
  res.json({
    lastVerified: CONTACTS_LAST_VERIFIED,
    bureaus: BUREAU_CONTACTS,
    court: COURT_CONTACT,
  });
}
