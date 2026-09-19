/**
 * Seeds one demo user with one parsed report, built from a small
 * FICTIONAL Experian-formatted fixture (fake name/accounts — not
 * anyone's real data) so the whole upload -> parse -> analyse ->
 * dashboard flow has something to look at without uploading a file
 * first. Run with `npm run seed`.
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

async function main() {
  const email = "demo@example.com";
  const password = "demo-password-123";

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash },
  });

  const parsed = parseExperianReport(FIXTURE_REPORT_TEXT);
  const { reportId, riskSummary } = await saveParsedReport({
    userId: user.id,
    sourceFileName: "sample-experian-report.pdf",
    sourceFileType: "pdf",
    rawText: FIXTURE_REPORT_TEXT,
    parsed,
    isSample: true,
  });

  console.log(`Seeded user ${email} / password "${password}"`);
  console.log(`Seeded report ${reportId}: risk level ${riskSummary.riskLevel}, ${riskSummary.alerts.length} alert(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
