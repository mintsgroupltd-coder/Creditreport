import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Credit Report Analyzer";
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 5; // -> 10 hex chars, grouped as XXXXX-XXXXX below

/** Generates a new base32 TOTP secret — not yet enabled for anything;
 * the caller stores it against the user as `totpSecret` but leaves
 * `totpEnabled` false until confirmSetup below verifies a real code,
 * so a half-finished enrollment can never gate login. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** The otpauth:// URI an authenticator app (Google Authenticator, 1Password,
 * Authy, etc) scans or imports — `accountEmail` shows up as the entry's
 * label so a user with several accounts on this app can tell them apart. */
export function buildOtpauthUrl(accountEmail: string, secret: string): string {
  return authenticator.keyuri(accountEmail, ISSUER, secret);
}

export async function totpQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

/** RFC 6238 with otplib's default 30s step / ±1 step window (its
 * built-in tolerance for clock drift) — verifies a 6-digit code against
 * the user's stored secret. */
export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code.trim(), secret });
  } catch {
    return false;
  }
}

/** Generates one-time backup codes for when the user doesn't have their
 * authenticator app to hand — returned in plaintext ONCE, by the caller,
 * immediately after generation; only bcrypt hashes of them are ever
 * persisted (see hashBackupCodes/consumeBackupCode below), same
 * never-store-the-raw-secret principle as a password. */
export function generateBackupCodes(): string[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(BACKUP_CODE_BYTES).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
}

/**
 * Checks `candidate` against the stored backup-code hashes and, if it
 * matches one, returns the remaining hashes with that one removed (each
 * backup code is single-use). Returns `null` if there's no match, so the
 * caller can tell "wrong code" apart from "matched, here's the updated
 * list to save".
 */
export async function consumeBackupCode(hashes: string[], candidate: string): Promise<string[] | null> {
  const trimmed = candidate.trim();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(trimmed, hashes[i])) {
      return [...hashes.slice(0, i), ...hashes.slice(i + 1)];
    }
  }
  return null;
}
