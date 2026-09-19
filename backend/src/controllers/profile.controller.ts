import { Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const PROFILE_SELECT = {
  email: true,
  fullName: true,
  postalAddress: true,
  dateOfBirth: true,
  electoralRollRegistered: true,
  identityConfirmedAt: true,
} as const;

type ProfileRow = {
  email: string;
  fullName: string | null;
  postalAddress: string | null;
  dateOfBirth: Date | null;
  electoralRollRegistered: boolean | null;
  identityConfirmedAt: Date | null;
};

/** Shapes the DB row into the API response — `dateOfBirth` as a plain
 * ISO date (not a full datetime, since only the date part was ever
 * asked for) and `identityConfirmed` as a plain boolean rather than
 * making the frontend infer it from a timestamp. */
function serializeProfile(row: ProfileRow) {
  return {
    email: row.email,
    fullName: row.fullName,
    postalAddress: row.postalAddress,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    electoralRollRegistered: row.electoralRollRegistered,
    identityConfirmed: row.identityConfirmedAt !== null,
  };
}

/** Name + postal address + date of birth are used to fill in the
 * "[Your name]" / "[Your address]" placeholders in generated dispute
 * letters and, once all three are set, to cross-check each report's own
 * application details against them (see services/analytics/identityCheck.ts).
 * This is self-declared by the account holder, never independently
 * verified — the app has no access to an official register to check
 * against, and every place this is shown says so. Electoral roll
 * registration is separate, purely self-declared supporting context
 * (also unverifiable by this app) offered because CRAs themselves often
 * weigh it when resolving an identity/address dispute. */
export async function getProfile(req: AuthenticatedRequest, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: PROFILE_SELECT });
  if (!user) throw new HttpError(404, "User not found");
  res.json(serializeProfile(user));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const updateProfileSchema = z.object({
  fullName: z.string().max(200).nullable(),
  postalAddress: z.string().max(2000).nullable(),
  dateOfBirth: z
    .string()
    .regex(DATE_ONLY, "dateOfBirth must be an ISO date (YYYY-MM-DD)")
    .nullable()
    .optional(),
  electoralRollRegistered: z.boolean().nullable().optional(),
});

export async function updateProfile(req: AuthenticatedRequest, res: Response) {
  const { fullName, postalAddress, dateOfBirth, electoralRollRegistered } = updateProfileSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { dateOfBirth: true, identityConfirmedAt: true } });
  if (!existing) throw new HttpError(404, "User not found");

  const nextFullName = fullName?.trim() || null;
  const nextPostalAddress = postalAddress?.trim() || null;
  const nextDateOfBirth = dateOfBirth !== undefined ? (dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null) : existing.dateOfBirth;
  // "Confirmed" means the account holder has stated all three core
  // identity fields — not that anything has been checked externally.
  // Keeps the original confirmation timestamp if it was already
  // confirmed and still is; only sets a fresh one on the transition
  // into "confirmed", and clears it the moment any field is blanked.
  const confirmed = Boolean(nextFullName && nextPostalAddress && nextDateOfBirth);
  const identityConfirmedAt = confirmed ? existing.identityConfirmedAt ?? new Date() : null;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      fullName: nextFullName,
      postalAddress: nextPostalAddress,
      dateOfBirth: nextDateOfBirth,
      ...(electoralRollRegistered !== undefined ? { electoralRollRegistered } : {}),
      identityConfirmedAt,
    },
    select: PROFILE_SELECT,
  });
  res.json(serializeProfile(user));
}
