/**
 * Seeds one demo user with three parsed reports, each built from a small
 * FICTIONAL Experian-formatted fixture (fake names/addresses/accounts —
 * not anyone's real data) so the whole upload -> parse -> analyse ->
 * dashboard flow has something to look at without uploading a file
 * first, across a spread of risk profiles rather than just one. Run
 * with `npm run seed`.
 *
 * All three fixture names/addresses are distinct from any name used in
 * the parser test fixtures (e.g. "Jordan Smith", "Casey Okonkwo") so a
 * seeded sample report is never visually confused with a unit-test one.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma";
import { parseExperianReport } from "../src/services/parsing/experianParser";
import { saveParsedReport } from "../src/services/reportPersistence";

// A minimal but structurally faithful fixture: same "RefLetter+Digits
// glued to the line" layout the real parser expects, built by hand
// from fictional data so it exercises the CCJ, default, settled, and
// DOB-mismatch code paths.
const FIXTURE_REPORT_TEXT = `
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

Previous Searches
P1MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4ABDate of Birth:14/03/1988
Searched by:EXAMPLE BANK PLC
Searched on:01/08/2026
Application Type:CREDIT CARD APPLICATION

Report Generated On: 01/09/2026Page 1 of 1
`;

// A "clean prime" profile: every account ACTIVE and low-utilisation, no
// defaults, no CCJs, and the same name/DOB on every block (no identity
// mismatch) — the opposite end of the risk spectrum from the mixed-file
// fixture above. Note the mortgage and current account deliberately carry
// no "Credit Limit" field at all (real Experian mortgage/current-account
// entries don't have one) so computeUtilisation() in negativeMarkers.ts,
// which only considers accounts with a known positive limit, doesn't
// pick them up.
const CLEAN_PROFILE_FIXTURE_TEXT = `
Your Experian Credit Report (printable version)
Application Details
MRS PRIYA CHANDRASEKARANDate of Birth:22/07/1985
Present Address:4,  Harbourside Walk,  BRISTOL,  BS1 5TR

Credit Account Information
C1MRS PRIYA CHANDRASEKARAN, 4, HARBOURSIDE WALK, BRISTOL, BS1 5TRDate of Birth:22/07/1985
Company:PRIME BANK PLC
Account Type:CREDIT CARD
Started:01/03/2018
Current Balance:£120
Credit Limit:£3000
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[0]000
Balance:£120£110£100£90

C2MRS PRIYA CHANDRASEKARAN, 4, HARBOURSIDE WALK, BRISTOL, BS1 5TRDate of Birth:22/07/1985
Company:PRIME MORTGAGE LTD
Account Type:MORTGAGE
Started:01/06/2015
Current Balance:£180000
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[0]000
Balance:£180000£180500£181000£181500

C3MRS PRIYA CHANDRASEKARAN, 4, HARBOURSIDE WALK, BRISTOL, BS1 5TRDate of Birth:22/07/1985
Company:PRIME CURRENT ACCOUNTS LTD
Account Type:CURRENT ACCOUNT
Started:01/01/2012
Current Balance:£0
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[0]000
Balance:£0£0£0£0

Previous Searches
P1MRS PRIYA CHANDRASEKARAN, 4, HARBOURSIDE WALK, BRISTOL, BS1 5TRDate of Birth:22/07/1985
Searched by:PRIME BANK PLC
Searched on:01/08/2026
Application Type:CREDIT CARD APPLICATION

Report Generated On: 01/09/2026Page 1 of 1
`;

// An "adverse defaults" profile: two accounts in unresolved default, one
// unsatisfied CCJ, and a third account run up to 90% of its limit — the
// combination of negative markers this app's analytics engine (and the
// illustrative credit score estimate) most heavily penalise.
const ADVERSE_DEFAULTS_FIXTURE_TEXT = `
Your Experian Credit Report (printable version)
Application Details
MR NIALL FITZGERALDDate of Birth:05/11/1979
Present Address:22,  Riverside Court,  GLASGOW,  G1 2AB

Public Record Information
J1MR NIALL FITZGERALD, 22, RIVERSIDE COURT, GLASGOW, G1 2AB
Information Type:JUDGMENT
Court Name:GLASGOW SHERIFF COURT
Date:14/02/2024
Amount:£3400
Case Number:GS45KL09
Source:REGISTRY TRUST LTD

Credit Account Information
C1MR NIALL FITZGERALD, 22, RIVERSIDE COURT, GLASGOW, G1 2ABDate of Birth:05/11/1979
Company:SUBPRIME LOANS LTD
Account Type:LOAN
Started:01/02/2019
Current Balance:£4200
Default Date:10/06/2023
Default Balance:£4200
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[8]888
Balance:£4200£4200£4200£4200

C2MR NIALL FITZGERALD, 22, RIVERSIDE COURT, GLASGOW, G1 2ABDate of Birth:05/11/1979
Company:QUICKCASH CREDIT LTD
Account Type:CREDIT CARD
Started:01/09/2020
Current Balance:£1750
Default Date:22/01/2024
Default Balance:£1750
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[8]888
Balance:£1750£1750£1750£1750

C3MR NIALL FITZGERALD, 22, RIVERSIDE COURT, GLASGOW, G1 2ABDate of Birth:05/11/1979
Company:EVERYDAY BANK PLC
Account Type:CREDIT CARD
Started:01/05/2021
Current Balance:£1800
Credit Limit:£2000
Updated To:01/09/2026
Account Status Details: (1 - 12 months)
Status Code:[1]111
Balance:£1800£1750£1700£1650

Previous Searches
P1MR NIALL FITZGERALD, 22, RIVERSIDE COURT, GLASGOW, G1 2ABDate of Birth:05/11/1979
Searched by:QUICKCASH CREDIT LTD
Searched on:01/07/2026
Application Type:CREDIT CARD APPLICATION

Report Generated On: 01/09/2026Page 1 of 1
`;

/**
 * Creates one sample (isSample: true) report from a fixture, but only if
 * a sample report with this exact sourceFileName doesn't already exist
 * for this user — the same "upsert, don't duplicate" idea as the user
 * upsert below, applied to reports (which have no unique key of their
 * own to upsert on). Running `npm run seed` again is then a no-op for
 * reports it already created, rather than piling up duplicates.
 */
async function ensureSampleReport(userId: string, sourceFileName: string, rawText: string) {
  const existing = await prisma.report.findFirst({ where: { userId, sourceFileName, isSample: true } });
  if (existing) {
    console.log(`Sample report already seeded: ${sourceFileName} (${existing.id}) — skipping.`);
    return;
  }

  const parsed = parseExperianReport(rawText);
  const { reportId, riskSummary } = await saveParsedReport({
    userId,
    sourceFileName,
    sourceFileType: "pdf",
    rawText,
    parsed,
    isSample: true,
  });
  console.log(`Seeded report ${reportId} (${sourceFileName}): risk level ${riskSummary.riskLevel}, ${riskSummary.alerts.length} alert(s)`);
}

async function main() {
  const email = "demo@example.com";
  const password = "demo-password-123";

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash },
  });

  console.log(`Seeded user ${email} / password "${password}"`);

  await ensureSampleReport(user.id, "sample-experian-report.pdf", FIXTURE_REPORT_TEXT);
  await ensureSampleReport(user.id, "sample-experian-report-clean-prime.pdf", CLEAN_PROFILE_FIXTURE_TEXT);
  await ensureSampleReport(user.id, "sample-experian-report-adverse-defaults.pdf", ADVERSE_DEFAULTS_FIXTURE_TEXT);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
