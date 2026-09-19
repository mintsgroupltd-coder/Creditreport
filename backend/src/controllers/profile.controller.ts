import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/** Name + postal address are only ever used to fill in the "[Your name]" /
 * "[Your address]" placeholders in generated dispute letters — nothing
 * else in the app reads them. Both stay optional; letters just fall back
 * to the bracketed placeholders when either is blank. */
export async function getProfile(req: AuthenticatedRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { email: true, fullName: true, postalAddress: true },
  });
  if (!user) throw new HttpError(404, "User not found");
  res.json(user);
}

const updateProfileSchema = z.object({
  fullName: z.string().max(200).nullable(),
  postalAddress: z.string().max(2000).nullable(),
});

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  const { fullName, postalAddress } = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      fullName: fullName?.trim() || null,
      postalAddress: postalAddress?.trim() || null,
    },
    select: { email: true, fullName: true, postalAddress: true },
  });
  res.json(user);
}
