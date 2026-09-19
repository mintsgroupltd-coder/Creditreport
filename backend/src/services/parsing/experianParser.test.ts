import { describe, expect, it } from "vitest";
import { parseExperianReport } from "./experianParser";

/**
 * Fixture built the same way as prisma/seed.ts's demo report: fictional
 * data, but laid out exactly like a real Experian "printable version"
 * export — same glued-ref block headers, same glued-label lines — so it
 * exercises the parser's real code paths rather than a simplified stand-in.
 */
const FIXTURE = `
Your Experian Credit Report (printable version)
Application Details
MR JORDAN SMITHDate of Birth:14/03/1988
Present Address:12,  Sample Street,  LEEDS,  LS1 4AB
Other Addresses:8,  Old Terrace,  LEEDS,  LS2 9ZZ

Public Record Information
J1MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4AB
Information Type:JUDGMENT
Court Name:LEEDS COUNTY COURT
Date:02/03/2023
Amount:£1250
Case Number:AB12CD34
Source:REGISTRY TRUST LTD

Credit Account Information
C1MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4ABDate of Birth:14/03/1988
Company:EXAMPLE CREDIT CARD LTD
Account Type:CREDIT CARD
Started:01/06/2019
Current Balance:£450
Credit Limit:£500
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[0]0000
Balance:£450£420£400£380

C2MR JON SMITH, 8, OLD TERRACE, LEEDS, LS2 9ZZDate of Birth:22/11/1990
Company:EXAMPLE LOANS LTD
Account Type:LOAN
Started:15/01/2020
Current Balance:£1800
Default Date:10/05/2022
Default Balance:£1800
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[8]888
Balance:£1800£1800£1800£1800

C3MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4ABDate of Birth:14/03/1988
Company:EXAMPLE BANK PLC
Account Type:CURRENT ACCOUNT
Started:01/01/2015
Current Balance:SETTLED
Settlement Date:01/01/2023Updated To:01/02/2023
Account Status Details: (1 - 12 months)
Status Code:[0]0000
Balance:£0£0£0£0

C4MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4ABDate of Birth:14/03/1988
Company:EXAMPLE STORE CARD LTD
Account Type:STORE CARD
Started:01/03/2018
Current Balance:SATISFIED
Default Date:01/06/2021
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[8]888

Previous Searches
P1MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4ABDate of Birth:14/03/1988
Searched by:EXAMPLE BANK PLC
Searched on:01/08/2026
Application Type:CREDIT CARD APPLICATION

Report Generated On: 01/09/2026Page 1 of 1
`;

describe("parseExperianReport", () => {
  const report = parseExperianReport(FIXTURE);

  it("recognises the applicant's own name, DOB and addresses from Application Details", () => {
    expect(report.applicantName).toBe("JORDAN SMITH");
    expect(report.dateOfBirth).toBe("1988-03-14");
    expect(report.addresses.length).toBeGreaterThanOrEqual(1);
    expect(report.addresses[0].line).toContain("Sample Street");
  });

  it("splits the document into one block per account despite glued reference headers", () => {
    // C1..C4 -> 4 accounts; a naive \b-based split would match zero blocks
    // (see the comment in experianParser.ts on why \b fails here).
    expect(report.accounts).toHaveLength(4);
    expect(report.accounts.map((a) => a.bureauRef)).toEqual(["C1", "C2", "C3", "C4"]);
  });

  it("extracts label/value pairs correctly even when two labels are glued onto one line", () => {
    // C3's "Settlement Date:01/01/2023Updated To:01/02/2023" line has no
    // separator between the two labels.
    const settledAccount = report.accounts.find((a) => a.bureauRef === "C3");
    expect(settledAccount?.satisfactionDate).toBe("2023-01-01");
  });

  it("records a live account's current balance and credit limit", () => {
    const card = report.accounts.find((a) => a.bureauRef === "C1");
    expect(card?.status).toBe("ACTIVE");
    expect(card?.currentBalance).toBe(450);
    expect(card?.creditLimit).toBe(500);
  });

  it("keeps an unresolved default in DEFAULT status with its balance intact", () => {
    const defaulted = report.accounts.find((a) => a.bureauRef === "C2");
    expect(defaulted?.status).toBe("DEFAULT");
    expect(defaulted?.defaultBalance).toBe(1800);
    // Falling back to £0 here would make a real unresolved debt vanish
    // from any total — this is the exact bug the parser guards against.
    expect(defaulted?.currentBalance).toBe(1800);
  });

  it("does not trust a defaulted account's 'Current Balance: SATISFIED' without a corroborating date", () => {
    // C4 has a Default Date but no Satisfaction/Settlement Date, so the
    // SATISFIED label on its own isn't enough — the parser should keep it
    // classified as DEFAULT (not silently clear it to SATISFIED/£0) and
    // surface a warning that the label and data disagree.
    const noDateSatisfied = report.accounts.find((a) => a.bureauRef === "C4");
    expect(noDateSatisfied?.status).toBe("DEFAULT");
    expect(noDateSatisfied?.satisfactionDate).toBeUndefined();
    expect(report.warnings.some((w) => w.includes("C4") && w.toLowerCase().includes("satisf"))).toBe(true);
  });

  it("parses the monthly status/balance history grid", () => {
    const card = report.accounts.find((a) => a.bureauRef === "C1");
    expect(card?.statusHistory.length).toBeGreaterThan(0);
    expect(card?.statusHistory[0].statusCode).toBe("0");
    expect(card?.statusHistory[0].balance).toBe(450);
  });

  it("parses a CCJ from a Public Record Information block", () => {
    const ccj = report.events.find((e) => e.type === "CCJ");
    expect(ccj).toBeDefined();
    expect(ccj?.amount).toBe(1250);
    expect(ccj?.date).toBe("2023-03-02");
    expect((ccj?.detail as Record<string, unknown>)?.caseNumber).toBe("AB12CD34");
    expect((ccj?.detail as Record<string, unknown>)?.isSatisfied).toBe(false);
  });

  it("parses a search event", () => {
    const search = report.events.find((e) => e.type === "SEARCH");
    expect(search).toBeDefined();
    expect(search?.date).toBe("2026-08-01");
  });

  it("flags a name/DOB mismatch between two account blocks as different recorded identities", () => {
    // C2's block header records "JON SMITH" / DOB 22/11/1990 — a
    // different name and DOB from the applicant's own (JORDAN SMITH /
    // 14/03/1988) — the raw material the anomaly-detection analytics
    // uses to flag a possible mixed file.
    const mismatched = report.accounts.find((a) => a.bureauRef === "C2");
    expect(mismatched?.recordedName).toBe("JON SMITH");
    expect(mismatched?.recordedDob).toBe("1990-11-22");
  });

  it("produces no warnings about failing to find any accounts at all", () => {
    expect(report.warnings.some((w) => w.includes("No credit accounts"))).toBe(false);
  });
});

describe("parseExperianReport on an unrecognisable document", () => {
  it("warns rather than throwing when no account blocks are found", () => {
    const report = parseExperianReport("This is not a credit report at all.");
    expect(report.accounts).toHaveLength(0);
    expect(report.warnings.some((w) => w.includes("No credit accounts"))).toBe(true);
  });
});
