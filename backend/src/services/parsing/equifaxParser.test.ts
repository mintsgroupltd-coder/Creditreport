import { describe, expect, it } from "vitest";
import { parseEquifaxReport } from "./equifaxParser";

/**
 * Fixture built the same way as experianParser.test.ts's FIXTURE: fictional
 * data (name, address, lenders, account numbers), but laid out exactly like
 * a real Equifax consumer report export — same glued "LabelValue" table
 * rows (no colon), same "JFMAMJJASOND" payment-history grid, same page
 * footer, same numbered sections — so it exercises the parser's real code
 * paths rather than a simplified stand-in. See equifaxParser.ts's own
 * comment for where this structure came from.
 */
const FIXTURE = `
Mr. Casey Okonkwo - Equifax Credit Report - 15/01/2026
1    of     11
Consumer Protected
Mr. Casey Okonkwo's Equifax Credit Report

1. Personal Information
These are the addresses you entered as part of your initial application.
Current Address
9 MAPLE CLOSE
DERBY
DE1 2AB
Previous Addresses
PREVIOUS ADDRESS 1
2 ELM STREET
NOTTINGHAM
NG1 3CD
Linked Addresses
Linked addresses are all the addresses that you have lived at where you have applied for or taken
out a credit agreement or account with a service provider.

Mr. Casey Okonkwo - Equifax Credit Report - 15/01/2026
2    of     11
Consumer Protected
2. Financial Associates
No data present
There is no data present in this section.

3. Electoral Register
No data present
There is no data present in this section.

4. Credit Agreements
Open Credit Agreements
Credit Card Agreement
Credit Card from SILVERLEAF BANK (I)
Account NumberXXXXXXX1234
Address On Agreement9 MAPLE CLOSE DERBY
DE1 2AB
Account HolderMR CASEY OKONKWO
Date of Birth05/07/1985
Repayment TermsN/A
StatusUp to date with payments
Payment FrequencyMonthly
Credit Limit£1,000
Start Balance£0
Current Balance£250
Default/Delinquent Balance£0
Start Date01/03/2021
Date Updated01/01/2026
Date last DelinquentN/A
Date SatisfiedN/A
Default DateN/A
Payment Amount£25
Previous Statement Balance£250
Cash Advance Amount£0
Number of Cash Advances During Month0
Credit Limit ChangeNo Change
Minimum PaymentNo
Promotional RateNo
Supplementary InformationN/A

Mr. Casey Okonkwo - Equifax Credit Report - 15/01/2026
3    of     11
Consumer Protected
Payment History/ Account Number: XXXXXXX1234
JFMAMJJASOND
2026010
2025000000000000
2024001S
See Appendix A for explanatory information on payment statuses used above.

Loan Agreements
Loan from BRIGHTWAY FINANCE LTD (I)
Account NumberXXXXX9988
Address On Agreement9 MAPLE CLOSE DERBY
DE1 2AB
Account HolderMR CASEY OKONKWO
Date of Birth05/07/1985
Repayment Terms24 payments @ £45
StatusDefault
Payment FrequencyMonthly
Credit LimitN/A
Start Balance£1,080
Current Balance£620
Default/Delinquent Balance£620
Start Date10/02/2022
Date Updated01/01/2026
Date last DelinquentN/A
Date SatisfiedN/A
Default Date15/06/2023
Supplementary InformationN/A

Payment History/ Account Number: XXXXX9988
JFMAMJJASOND
2026D
See Appendix A for explanatory information on payment statuses used above.

Utilities Agreements
Communications Supplier from HARBOUR MOBILE LTD (I)
Account NumberXXXXXX5566
Address On Agreement9 MAPLE CLOSE DERBY
DE1 2AB
Account HolderMR CASEY OKONKWO
Date of Birth05/07/1985
Repayment TermsN/A
Status2 payments in arrears
Payment FrequencyMonthly
Credit LimitN/A
Start Balance£0
Current Balance£38
Default/Delinquent Balance£38
Start Date01/06/2023
Date Updated01/01/2026
Date last DelinquentN/A
Date SatisfiedN/A
Default DateN/A
Supplementary InformationN/A

Payment History/ Account Number: XXXXXX5566
JFMAMJJASOND
202612
See Appendix A for explanatory information on payment statuses used above.

Credit Card from MERIDIAN CARDS (I)
Account NumberXXXXXXX4400
Address On Agreement9 MAPLE CLOSE DERBY
DE1 2AB
Account HolderMR CASEY OKONKWO
Date of Birth05/07/1985
Repayment TermsN/A
StatusInactive
Payment FrequencyMonthly
Credit Limit£200
Start Balance£0
Current Balance£0
Default/Delinquent Balance£0
Start Date01/01/2020
Date Updated01/01/2026
Date last DelinquentN/A
Date SatisfiedN/A
Default DateN/A
Supplementary InformationN/A

Closed Credit Agreements
Banking Agreements
Current Account from NORTHGATE SAVINGS (I)
Account NumberXXXXXXXXXXXX7788
Address On Agreement9 MAPLE CLOSE DERBY
DE1 2AB
Account HolderMR CASEY OKONKWO
Date of Birth05/07/1985
Repayment TermsN/A
StatusSettled
Payment FrequencyMonthly
Credit LimitN/A
Start Balance£0
Current Balance£0
Default/Delinquent Balance£0
Start Date01/01/2019
Date Updated10/01/2024
Date last DelinquentN/A
Date Satisfied10/01/2024
Default DateN/A
Supplementary InformationN/A

Mr. Casey Okonkwo - Equifax Credit Report - 15/01/2026
4    of     11
Consumer Protected
Payment History/ Account Number: XXXXXXXXXXXX7788
JFMAMJJASOND
2024S
See Appendix A for explanatory information on payment statuses used above.

5. Court and other public records
Public Records at Current Address
No data present
There is no data present in this section.
Public Records at Previous Addresses
COUNTY COURT JUDGMENT registered 04/03/2023 for £750 at DERBY COUNTY COURT.
Public Records at Linked Addresses
No data present
There is no data present in this section.

6. Notice of Correction
No data present

7. Searches
Hard Searches
Current Address
04/01/2026SILVERLEAF BANK
SurnameForename &
Middle Initial
Date of birthSearch TypeJoint
Application
OKONKWOCASEY05/07/1985Credit ApplicationNo
Previous Addresses
No data present
There is no data present in this section.
Linked Addresses
No data present
There is no data present in this section.
Soft Searches
Current Address
02/01/2026CLEARSCORE TECHNOLOGY LTD
SurnameForename &
Middle Initial
Date of birthSearch TypeJoint
Application
OKONKWOCASEYN/AConsumer EnquiryNo

8. Property Valuation
No data present
`;

describe("parseEquifaxReport", () => {
  const report = parseEquifaxReport(FIXTURE);

  it("recognises the applicant's own name from the page footer", () => {
    expect(report.applicantName).toBe("Casey Okonkwo");
  });

  it("falls back to the first account block's Date of Birth for the applicant's own DOB", () => {
    expect(report.dateOfBirth).toBe("1985-07-05");
  });

  it("parses the current, previous and linked addresses from section 1", () => {
    expect(report.addresses.find((a) => a.source === "Current Address")?.line).toContain("MAPLE CLOSE");
    expect(report.addresses.find((a) => a.source === "Previous Address 1")?.line).toContain("ELM STREET");
  });

  it("splits the credit agreements section into one block per account despite glued LabelValue rows", () => {
    expect(report.accounts).toHaveLength(5);
    expect(report.accounts.map((a) => a.lenderName)).toEqual([
      "SILVERLEAF BANK",
      "BRIGHTWAY FINANCE LTD",
      "HARBOUR MOBILE LTD",
      "MERIDIAN CARDS",
      "NORTHGATE SAVINGS",
    ]);
  });

  it("treats an 'Inactive' account (dormant, not closed or defaulted) as still active", () => {
    const dormant = report.accounts.find((a) => a.lenderName === "MERIDIAN CARDS");
    expect(dormant?.status).toBe("ACTIVE");
  });

  it("records a live account's balance, credit limit and recorded identity", () => {
    const card = report.accounts.find((a) => a.lenderName === "SILVERLEAF BANK");
    expect(card?.accountType).toBe("Credit Card");
    expect(card?.status).toBe("ACTIVE");
    expect(card?.currentBalance).toBe(250);
    expect(card?.creditLimit).toBe(1000);
    expect(card?.recordedName).toBe("CASEY OKONKWO");
    expect(card?.recordedDob).toBe("1985-07-05");
    expect(card?.linkedAddress).toContain("MAPLE CLOSE");
  });

  it("classifies a defaulted account as DEFAULT and records its default balance/date", () => {
    const loan = report.accounts.find((a) => a.lenderName === "BRIGHTWAY FINANCE LTD");
    expect(loan?.status).toBe("DEFAULT");
    expect(loan?.defaultDate).toBe("2023-06-15");
    expect(loan?.defaultBalance).toBe(620);
    expect(report.events.some((e) => e.type === "DEFAULT" && e.accountRef === "XXXXX9988")).toBe(true);
  });

  it("treats an account 'in arrears' as still active, and raises an ARREARS event", () => {
    const mobile = report.accounts.find((a) => a.lenderName === "HARBOUR MOBILE LTD");
    expect(mobile?.status).toBe("ACTIVE");
    const arrears = report.events.find((e) => e.type === "ARREARS" && e.accountRef === "XXXXXX5566");
    expect(arrears).toBeDefined();
    expect((arrears?.detail as Record<string, unknown>)?.monthsInArrears).toBe(2);
  });

  it("classifies a closed account with a Date Satisfied as SETTLED", () => {
    const closed = report.accounts.find((a) => a.lenderName === "NORTHGATE SAVINGS");
    expect(closed?.status).toBe("SETTLED");
    expect(closed?.satisfactionDate).toBe("2024-01-10");
  });

  it("expands a full-length payment history row into 12 months, and aligns short rows by position", () => {
    const card = report.accounts.find((a) => a.lenderName === "SILVERLEAF BANK");
    const history = card?.statusHistory ?? [];
    // 2026 (top, 3 codes) -> left-aligned Jan-Mar; 2025 (full 12); 2024
    // (bottom, 4 codes) -> right-aligned Sep-Dec.
    expect(history).toHaveLength(3 + 12 + 4);
    expect(history.filter((h) => h.periodDate.startsWith("2026"))).toEqual([
      { periodDate: "2026-01-01", statusCode: "0" },
      { periodDate: "2026-02-01", statusCode: "1" },
      { periodDate: "2026-03-01", statusCode: "0" },
    ]);
    expect(history.filter((h) => h.periodDate.startsWith("2024"))).toEqual([
      { periodDate: "2024-09-01", statusCode: "0" },
      { periodDate: "2024-10-01", statusCode: "0" },
      { periodDate: "2024-11-01", statusCode: "1" },
      { periodDate: "2024-12-01", statusCode: "S" },
    ]);
  });

  it("falls back to the generic scanner for court records when the section isn't entirely 'No data present', and warns about it", () => {
    const ccj = report.events.find((e) => e.type === "CCJ");
    expect(ccj).toBeDefined();
    expect(ccj?.amount).toBe(750);
    expect(ccj?.date).toBe("2023-03-04");
    expect(report.warnings.some((w) => w.includes("Section 5") && w.toLowerCase().includes("generic scanner"))).toBe(true);
  });

  it("parses hard and soft searches, including a row where the DOB is N/A", () => {
    const searches = report.events.filter((e) => e.type === "SEARCH");
    expect(searches).toHaveLength(2);
    const hard = searches.find((e) => (e.detail as Record<string, unknown>)?.hard === true);
    expect(hard?.date).toBe("2026-01-04");
    expect((hard?.detail as Record<string, unknown>)?.searchedBy).toBe("SILVERLEAF BANK");
    expect((hard?.detail as Record<string, unknown>)?.applicationType).toBe("Credit Application");
    expect((hard?.detail as Record<string, unknown>)?.jointApplication).toBe(false);

    const soft = searches.find((e) => (e.detail as Record<string, unknown>)?.hard === false);
    expect(soft?.date).toBe("2026-01-02");
    expect((soft?.detail as Record<string, unknown>)?.applicationType).toBe("Consumer Enquiry");
  });

  it("produces no warning about failing to find any accounts at all", () => {
    expect(report.warnings.some((w) => w.includes("No credit accounts"))).toBe(false);
  });
});

describe("parseEquifaxReport on an unrecognisable document", () => {
  it("warns rather than throwing when no account blocks are found", () => {
    const report = parseEquifaxReport("This is not a credit report at all.");
    expect(report.accounts).toHaveLength(0);
    expect(report.warnings.some((w) => w.includes("No credit accounts"))).toBe(true);
  });
});
