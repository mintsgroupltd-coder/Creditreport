import { describe, expect, it } from "vitest";
import { authenticator } from "otplib";
import {
  buildOtpauthUrl,
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotpCode,
} from "./totp";

describe("generateTotpSecret / verifyTotpCode", () => {
  it("accepts a code generated from the same secret", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects a code generated from a different secret", () => {
    const secret = generateTotpSecret();
    const otherSecret = generateTotpSecret();
    const codeFromOther = authenticator.generate(otherSecret);
    expect(verifyTotpCode(secret, codeFromOther)).toBe(false);
  });

  it("rejects garbage input without throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "not-a-code")).toBe(false);
  });

  it("tolerates surrounding whitespace, matching how a user might paste a code", () => {
    const secret = generateTotpSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotpCode(secret, `  ${code}  `)).toBe(true);
  });
});

describe("buildOtpauthUrl", () => {
  it("embeds the account email and issuer so an authenticator app can label the entry", () => {
    const url = buildOtpauthUrl("jordan@example.com", "ABCDEFGHIJKLMNOP");
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(decodeURIComponent(url)).toContain("jordan@example.com");
    expect(decodeURIComponent(url)).toContain("Credit Report Analyzer");
  });
});

describe("generateBackupCodes", () => {
  it("generates 8 distinct, consistently-formatted codes", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    }
  });
});

describe("hashBackupCodes / consumeBackupCode", () => {
  it("matches a valid code and returns the remaining hashes with it removed", async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);

    const remaining = await consumeBackupCode(hashes, codes[3]);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(hashes.length - 1);

    // The consumed code no longer matches anything in the remaining set.
    const secondAttempt = await consumeBackupCode(remaining!, codes[3]);
    expect(secondAttempt).toBeNull();
  });

  it("returns null for a code that was never issued", async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);
    const result = await consumeBackupCode(hashes, "00000-00000");
    expect(result).toBeNull();
  });

  it("tolerates surrounding whitespace", async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);
    const result = await consumeBackupCode(hashes, `  ${codes[0]}  `);
    expect(result).not.toBeNull();
  });
});
