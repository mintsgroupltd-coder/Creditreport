import { describe, expect, it } from "vitest";
import { parseTransUnionReport } from "./transunionParser";

/**
 * Fixture laid out exactly like the real TransUnion "My Credit Report" PDF
 * export this parser was built and cross-checked against (a real 189-page
 * sample — see transunionParser.ts's own file comment), but entirely with
 * fictional data: no name, address, account number, lender or case number
 * below belongs to the real report. Same glued "LabelValue" rows (no
 * separator), same account-summary header line shape
 * ("<org>£<balance><date><status>"), same Judgments table row shape
 * ("<case><type><status>"), same closed set of Search purpose phrases, and
 * the same page-break artefact where a category heading ("Other accounts")
 * can land mid-block.
 */
const FIXTURE = `
Mr Ade Balogun's TransUnion Credit Report
Report created19 Sep 2026

Personal Information
NameMr Ade Balogun
Date of birthOctober 10, 1985
Current addressFlat 2, 10 Example Street, Manchester, M1 1AA

Financial Account Information
Credit cards
ORGANISATIONBALANCEUPDATEDSTATUS
Barclaycard£1,20320 Sep 2026Up to date
Account numberXXXXXXXXXXXX4471
Account typeCredit card
Account start date14/03/2018
Opening balance£1,500
Regular payment£45

Personal loans and mortgages
ORGANISATIONBALANCEUPDATEDSTATUS
This account is managed under a structured repayment plan agreed directly with the lender in early 2023
Lantern Finance
£4,54825 Jun 2026Default
Account numberXXXXXXXXXXXX7788
Account start date10/01/2020
Opening balance£5,000
Date of default25/06/2026
Default balance£4,548
NameMr Ade Balogun
AddressFlat 2, 10 Example Street, Manchester, M1 1AA

Other accounts
ORGANISATIONBALANCEUPDATEDSTATUS
Newday LTD (Aqua)£75115 Jul 2020Settled
Account numberXXXXXXXXXXXX9911
Account holder start date17/06/2019
Other accounts
Opening balance£800
Account holder end date02/02/2022

Test Retail Card£4520 Sep 2026Up to date
Account typeStore card

Closed accounts
ORGANISATIONBALANCEUPDATEDSTATUS
This account was closed after being repaid in full ahead of its scheduled end date by several months
Vanquis Bank
£32010 Nov 2025Satisfied
Account numberXXXXXXXXXXXX2200
Account start date01/05/2015
Opening balance£500
Account end date10/11/2025

Searches on your current address
Lloyds BankCredit Application15 Aug 2026
Input address
Search referenceAB12345
NameMr Ade Balogun
Date of birth10/10/1985
Application typeSole
Experian LtdConsumer Credit File Request02 Jan 2026
Input address
Search referenceAB99999
NameMr Ade Balogun
Application typeJoint
A Direct Marketing PartnerBespoke Enquiry Type28 Feb 2026
Input address
Application typeSole

Address Links

Address link history
1. Flat 2, 10 Example Street, Manchester, M1 1AA
2. 4 Old Vicarage Road, Leeds, LS1 4AB
Address link details

Public Information

Judgments
CASE NUMBERTYPESTATUS
ND1A2B3C4DCountyCourtJudgmentActive
NameMr Ade Balogun
AddressFlat 2, 10 Example Street, Manchester, M1 1AA
Court nameManchester County Court
Judgment date12/03/2025
Amount£1,250
9X8Y7Z6WCountyCourtJudgmentSatisfied
NameMr Ade Balogun
Court nameLeeds County Court
Judgment date05/01/2023
Amount£640
Date satisfied19/09/2023
Notices of Correction
No notices of correction are recorded.
`;

describe("parseTransUnionReport", () => {
  const report = parseTransUnionReport(FIXTURE);

  it("tags the report as TransUnion", () => {
    expect(report.bureau).toBe("TRANSUNION");
  });

  it("parses the applicant's name and date of birth from Personal Information", () => {
    expect(report.applicantName).toBe("Ade Balogun");
    expect(report.dateOfBirth).toBe("1985-10-10");
  });

  it("parses the current address and the Address link history list", () => {
    expect(report.addresses.find((a) => a.source === "Current Address")?.line).toContain("Example Street");
    const links = report.addresses.filter((a) => a.source === "Address Link");
    expect(links.map((a) => a.line)).toEqual([
      "Flat 2, 10 Example Street, Manchester, M1 1AA",
      "4 Old Vicarage Road, Leeds, LS1 4AB",
    ]);
  });

  it("splits the four account category subsections into one block per account despite glued header/label rows", () => {
    expect(report.accounts.map((a) => a.lenderName)).toEqual(["Barclaycard", "Lantern Finance", "Newday LTD (Aqua)", "Vanquis Bank"]);
  });

  it("derives an inline organisation name from the header line itself when one is present", () => {
    const card = report.accounts.find((a) => a.lenderName === "Barclaycard");
    expect(card?.status).toBe("ACTIVE");
    expect(card?.accountType).toBe("Credit card");
    expect(card?.openedDate).toBe("2018-03-14");
    expect(card?.bureauRef).toBe("XXXXXXXXXXXX4471");
    // The header row's own balance is glued to its date and deliberately
    // not extracted — only a defaulted account's balance is trusted.
    expect(card?.currentBalance).toBeUndefined();
  });

  it("derives an organisation name from the preceding lines when the header line has no inline prefix, skipping boilerplate and long prose", () => {
    const loan = report.accounts.find((a) => a.lenderName === "Lantern Finance");
    expect(loan).toBeDefined();
    expect(loan?.status).toBe("DEFAULT");
    expect(loan?.defaultDate).toBe("2026-06-25");
    expect(loan?.defaultBalance).toBe(4548);
    expect(loan?.currentBalance).toBe(4548);
    expect(loan?.recordedName).toBe("Ade Balogun");
    expect(loan?.linkedAddress).toContain("Example Street");
    expect(report.events.some((e) => e.type === "DEFAULT" && e.accountRef === "XXXXXXXXXXXX7788" && e.amount === 4548)).toBe(true);
  });

  it("keeps splitting and reading labelled fields correctly even when a category heading is injected mid-block (a real page-break artefact)", () => {
    const settled = report.accounts.find((a) => a.lenderName === "Newday LTD (Aqua)");
    expect(settled).toBeDefined();
    expect(settled?.status).toBe("SETTLED");
    expect(settled?.bureauRef).toBe("XXXXXXXXXXXX9911");
    expect(settled?.satisfactionDate).toBe("2022-02-02");
  });

  it("classifies 'Satisfied' accounts and reads their end date as the satisfaction date", () => {
    const satisfied = report.accounts.find((a) => a.lenderName === "Vanquis Bank");
    expect(satisfied).toBeDefined();
    expect(satisfied?.status).toBe("SATISFIED");
    expect(satisfied?.openedDate).toBe("2015-05-01");
    expect(satisfied?.satisfactionDate).toBe("2025-11-10");
  });

  it("skips an account block with no Account number and warns about it", () => {
    expect(report.accounts.some((a) => a.lenderName === "Test Retail Card")).toBe(false);
    expect(report.warnings.some((w) => w.includes('"Test Retail Card"') && w.includes("skipped"))).toBe(true);
  });

  it("always warns that the monthly Status/Balance/Limit/Statement/Payment grids couldn't be read", () => {
    expect(report.warnings.some((w) => w.includes("month-by-month") && w.includes("couldn't be read"))).toBe(true);
  });

  it("parses the Public Information Judgments table into CCJ events with the case reference, court and dispute/satisfaction flags", () => {
    const ccjs = report.events.filter((e) => e.type === "CCJ");
    expect(ccjs).toHaveLength(2);

    const active = ccjs.find((e) => (e.detail as Record<string, unknown>)?.caseNumber === "1A2B3C4D");
    expect(active?.date).toBe("2025-03-12");
    expect(active?.amount).toBe(1250);
    const activeDetail = active?.detail as Record<string, unknown>;
    expect(activeDetail.judgmentType).toBe("County Court Judgment");
    expect(activeDetail.courtName).toBe("Manchester County Court");
    expect(activeDetail.isSatisfied).toBe(false);
    expect(activeDetail.noticeOfDispute).toBe(true);

    const satisfied = ccjs.find((e) => (e.detail as Record<string, unknown>)?.caseNumber === "9X8Y7Z6W");
    expect(satisfied?.date).toBe("2023-01-05");
    expect(satisfied?.amount).toBe(640);
    const satisfiedDetail = satisfied?.detail as Record<string, unknown>;
    expect(satisfiedDetail.isSatisfied).toBe(true);
    expect(satisfiedDetail.satisfiedDate).toBe("2023-09-19");
    expect(satisfiedDetail.noticeOfDispute).toBe(false);
  });

  it("parses Searches with a recognised purpose phrase, including a joint application", () => {
    const searches = report.events.filter((e) => e.type === "SEARCH");
    expect(searches).toHaveLength(3);

    const solo = searches.find((e) => (e.detail as Record<string, unknown>)?.searchedBy === "Lloyds Bank");
    expect(solo?.date).toBe("2026-08-15");
    expect((solo?.detail as Record<string, unknown>)?.applicationType).toBe("Credit Application");
    expect((solo?.detail as Record<string, unknown>)?.jointApplication).toBe(false);

    const joint = searches.find((e) => (e.detail as Record<string, unknown>)?.searchedBy === "Experian Ltd");
    expect(joint?.date).toBe("2026-01-02");
    expect((joint?.detail as Record<string, unknown>)?.applicationType).toBe("Consumer Credit File Request");
    expect((joint?.detail as Record<string, unknown>)?.jointApplication).toBe(true);
  });

  it("falls back to a trailing-date extraction for a search purpose phrase it doesn't recognise, rather than dropping the row", () => {
    const searches = report.events.filter((e) => e.type === "SEARCH");
    const unknown = searches.find((e) => e.date === "2026-02-28");
    expect(unknown).toBeDefined();
    const detail = unknown?.detail as Record<string, unknown>;
    expect(detail.applicationType).toBeUndefined();
    expect(detail.jointApplication).toBe(false);
  });

  it("produces no warning about failing to find any accounts, or any search history, at all", () => {
    expect(report.warnings.some((w) => w.includes("No credit accounts"))).toBe(false);
    expect(report.warnings.some((w) => w.includes("No search history"))).toBe(false);
  });
});

/**
 * A second, minimal fixture with a Judgments row whose type this parser
 * doesn't recognise, to exercise the conservative keyword-scan fallback
 * (the same fallback-with-warning pattern used by equifaxParser.ts's
 * court-records section). Deliberately has no Financial Account
 * Information or Searches sections at all, to check the parser degrades
 * gracefully rather than assuming every section is present.
 */
const FALLBACK_JUDGMENT_FIXTURE = `
Personal Information
NameMr Chidi Umeh
Date of birthMay 4, 1990
Current addressFlat 5, 22 Bristol Road, Birmingham, B5 6TF

Public Information

Judgments
CASE NUMBERTYPESTATUS
A County Court Judgment for £900 was registered on 01/02/2024 and remains outstanding.
Notices of Correction
No notices of correction are recorded.
`;

describe("parseTransUnionReport's Judgments fallback for unrecognised row layouts", () => {
  const report = parseTransUnionReport(FALLBACK_JUDGMENT_FIXTURE);

  it("still finds the CCJ via a keyword scan and warns that the structured layout wasn't recognised", () => {
    const ccj = report.events.find((e) => e.type === "CCJ");
    expect(ccj).toBeDefined();
    expect(ccj?.date).toBe("2024-02-01");
    expect(ccj?.amount).toBe(900);
    expect(
      report.warnings.some((w) => w.includes("Judgments table") && w.includes("generic keyword scan"))
    ).toBe(true);
  });

  it("warns that no accounts were found rather than silently returning an empty list", () => {
    expect(report.accounts).toHaveLength(0);
    expect(report.warnings.some((w) => w.includes("No credit accounts were recognised"))).toBe(true);
  });
});

describe("parseTransUnionReport on an unrecognisable document", () => {
  it("warns rather than throwing when nothing matches at all", () => {
    const report = parseTransUnionReport("This is not a credit report at all.");
    expect(report.accounts).toHaveLength(0);
    expect(report.events).toHaveLength(0);
    expect(report.warnings.some((w) => w.includes("No credit accounts"))).toBe(true);
  });
});
