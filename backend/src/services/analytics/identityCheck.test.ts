import { describe, expect, it } from "vitest";
import { checkProfileIdentityMatch } from "./identityCheck";

const REPORT = { applicantName: "JORDAN SMITH", dateOfBirth: "1988-03-14" };

describe("checkProfileIdentityMatch", () => {
  it("says the profile isn't confirmed yet when the user hasn't filled in name+DOB+address", () => {
    const result = checkProfileIdentityMatch(REPORT, { fullName: null, dateOfBirth: null, confirmed: false });
    expect(result.profileConfirmed).toBe(false);
    expect(result.overallMatch).toBeNull();
    expect(result.message.toLowerCase()).toContain("settings");
  });

  it("reports a match when the confirmed profile's name and DOB agree with the report, tolerating word order", () => {
    const result = checkProfileIdentityMatch(REPORT, { fullName: "SMITH, JORDAN", dateOfBirth: "1988-03-14", confirmed: true });
    expect(result.nameMatches).toBe(true);
    expect(result.dobMatches).toBe(true);
    expect(result.overallMatch).toBe(true);
  });

  it("flags a mismatch when the confirmed profile's name disagrees with the report's own application details", () => {
    const result = checkProfileIdentityMatch(REPORT, { fullName: "ALEX JONES", dateOfBirth: "1988-03-14", confirmed: true });
    expect(result.nameMatches).toBe(false);
    expect(result.overallMatch).toBe(false);
    expect(result.message).toContain("ALEX JONES");
    expect(result.message).toContain("JORDAN SMITH");
  });

  it("flags a mismatch when the confirmed profile's date of birth disagrees with the report", () => {
    const result = checkProfileIdentityMatch(REPORT, { fullName: "JORDAN SMITH", dateOfBirth: "1990-01-01", confirmed: true });
    expect(result.dobMatches).toBe(false);
    expect(result.overallMatch).toBe(false);
  });

  it("returns null (nothing to compare) rather than a false mismatch when the report has no application details at all", () => {
    const result = checkProfileIdentityMatch({ applicantName: null, dateOfBirth: null }, { fullName: "Jordan Smith", dateOfBirth: "1988-03-14", confirmed: true });
    expect(result.nameMatches).toBeNull();
    expect(result.dobMatches).toBeNull();
    expect(result.overallMatch).toBeNull();
  });
});
