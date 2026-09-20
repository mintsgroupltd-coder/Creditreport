import { describe, expect, it } from "vitest";
import { balancesMateriallyDiffer, buildReconciliation, reconciliationToCsv, ReconciliationReportInput } from "./reconciliation";

function account(overrides: Partial<ReconciliationReportInput["accounts"][number]> = {}): ReconciliationReportInput["accounts"][number] {
  return {
    id: "acc-1",
    lenderId: "lender-1",
    lenderName: "Acme Bank",
    accountType: "Credit card",
    bureauRef: "C1",
    status: "ACTIVE",
    currentBalance: 500,
    defaultDate: null,
    ...overrides,
  };
}

describe("balancesMateriallyDiffer", () => {
  it("tolerates small differences on a large balance (percentage floor)", () => {
    expect(balancesMateriallyDiffer(10000, 10300)).toBe(false); // 3% apart
  });

  it("flags a real difference on a large balance", () => {
    expect(balancesMateriallyDiffer(10000, 11000)).toBe(true); // 10% apart
  });

  it("uses a flat £50 floor for small balances rather than a tiny percentage", () => {
    expect(balancesMateriallyDiffer(100, 140)).toBe(false); // 40 apart, under the £50 floor
    expect(balancesMateriallyDiffer(100, 160)).toBe(true); // 60 apart, over the £50 floor
  });
});

describe("buildReconciliation", () => {
  it("says it isn't eligible with fewer than two bureaus' worth of real reports", () => {
    const result = buildReconciliation([]);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.message.toLowerCase()).toContain("at least two");

    const oneBureau = buildReconciliation([{ bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "a.pdf", accounts: [] }]);
    expect(oneBureau.eligible).toBe(false);
    if (!oneBureau.eligible) expect(oneBureau.message).toContain("EXPERIAN");
  });

  it("matches the same lender+account-type across bureaus by lenderId, not by bureau reference", () => {
    const result = buildReconciliation([
      {
        bureau: "EXPERIAN",
        reportId: "r1",
        uploadedAt: "2026-01-01",
        sourceFileName: "experian.pdf",
        accounts: [account({ bureauRef: "C1" })],
      },
      {
        bureau: "EQUIFAX",
        reportId: "r2",
        uploadedAt: "2026-01-02",
        sourceFileName: "equifax.pdf",
        accounts: [account({ id: "acc-2", bureauRef: "EQ-9" })],
      },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.EXPERIAN?.bureauRef).toBe("C1");
    expect(result.rows[0].cells.EQUIFAX?.bureauRef).toBe("EQ-9");
    expect(result.rows[0].discrepancies).toHaveLength(0);
  });

  it("flags an account reported on one bureau but missing from another", () => {
    const result = buildReconciliation([
      { bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "e.pdf", accounts: [account()] },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [] },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.rows[0].discrepancies[0]).toContain("not by EQUIFAX");
  });

  it("flags a status mismatch between bureaus", () => {
    const result = buildReconciliation([
      { bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "e.pdf", accounts: [account({ status: "DEFAULT" })] },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [account({ id: "acc-2", status: "ACTIVE" })] },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.discrepancyCount).toBe(1);
    expect(result.rows[0].discrepancies[0]).toContain("Status differs");
  });

  it("flags a materially different balance between bureaus but not a rounding-level one", () => {
    const bigGap = buildReconciliation([
      { bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "e.pdf", accounts: [account({ currentBalance: 1000 })] },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [account({ id: "acc-2", currentBalance: 2000 })] },
    ]);
    expect(bigGap.eligible).toBe(true);
    if (bigGap.eligible) expect(bigGap.rows[0].discrepancies.some((d) => d.includes("Balance differs"))).toBe(true);

    const smallGap = buildReconciliation([
      { bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "e.pdf", accounts: [account({ currentBalance: 1000 })] },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [account({ id: "acc-2", currentBalance: 1010 })] },
    ]);
    expect(smallGap.eligible).toBe(true);
    if (smallGap.eligible) expect(smallGap.rows[0].discrepancies).toHaveLength(0);
  });

  it("sorts rows with the most discrepancies first", () => {
    const result = buildReconciliation([
      {
        bureau: "EXPERIAN",
        reportId: "r1",
        uploadedAt: "2026-01-01",
        sourceFileName: "e.pdf",
        accounts: [
          account({ id: "clean", lenderId: "lender-clean", lenderName: "Clean Bank", status: "ACTIVE" }),
          account({ id: "messy", lenderId: "lender-messy", lenderName: "Messy Bank", status: "DEFAULT" }),
        ],
      },
      {
        bureau: "EQUIFAX",
        reportId: "r2",
        uploadedAt: "2026-01-02",
        sourceFileName: "q.pdf",
        accounts: [
          account({ id: "clean2", lenderId: "lender-clean", lenderName: "Clean Bank", status: "ACTIVE" }),
          account({ id: "messy2", lenderId: "lender-messy", lenderName: "Messy Bank", status: "ACTIVE" }),
        ],
      },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.rows[0].lenderName).toBe("Messy Bank");
  });

  it("computes a debt-to-limit ratio per cell only when both balance and limit are known", () => {
    const result = buildReconciliation([
      {
        bureau: "EXPERIAN",
        reportId: "r1",
        uploadedAt: "2026-01-01",
        sourceFileName: "e.pdf",
        accounts: [account({ currentBalance: 250, totalCreditLimit: 1000 })],
      },
      {
        bureau: "EQUIFAX",
        reportId: "r2",
        uploadedAt: "2026-01-02",
        sourceFileName: "q.pdf",
        accounts: [account({ id: "acc-2", currentBalance: 250 })], // no totalCreditLimit
      },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.rows[0].cells.EXPERIAN?.totalCreditLimit).toBe(1000);
    expect(result.rows[0].cells.EXPERIAN?.debtToLimitRatio).toBeCloseTo(0.25);
    expect(result.rows[0].cells.EQUIFAX?.totalCreditLimit).toBeNull();
    expect(result.rows[0].cells.EQUIFAX?.debtToLimitRatio).toBeNull();
  });

  it("leaves debtToLimitRatio null when the limit is zero, rather than dividing by zero", () => {
    const result = buildReconciliation([
      { bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "e.pdf", accounts: [account({ currentBalance: 250, totalCreditLimit: 0 })] },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [account({ id: "acc-2" })] },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.rows[0].cells.EXPERIAN?.debtToLimitRatio).toBeNull();
  });
});

describe("reconciliationToCsv", () => {
  it("throws a clear error when the result isn't eligible", () => {
    const result = buildReconciliation([]);
    expect(() => reconciliationToCsv(result)).toThrow(/at least two/i);
  });

  it("produces a header row, a bureau status/balance/ratio triplet per bureau, and a discrepancies column", () => {
    const result = buildReconciliation([
      {
        bureau: "EXPERIAN",
        reportId: "r1",
        uploadedAt: "2026-01-01",
        sourceFileName: "e.pdf",
        accounts: [account({ status: "DEFAULT", currentBalance: 1000, totalCreditLimit: 2000 })],
      },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [] },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    const csv = reconciliationToCsv(result);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Lender,Account type,EXPERIAN status,EXPERIAN balance (GBP),EXPERIAN debt-to-limit ratio,EQUIFAX status,EQUIFAX balance (GBP),EQUIFAX debt-to-limit ratio,TRANSUNION status,TRANSUNION balance (GBP),TRANSUNION debt-to-limit ratio,Discrepancies"
    );
    expect(lines).toHaveLength(2);
    const fields = lines[1].split(",");
    expect(fields[0]).toBe("Acme Bank");
    expect(fields[2]).toBe("DEFAULT"); // EXPERIAN status
    expect(fields[3]).toBe("1000.00"); // EXPERIAN balance
    expect(fields[4]).toBe("0.50"); // EXPERIAN debt-to-limit ratio
    expect(fields[5]).toBe(""); // EQUIFAX status (missing)
    expect(lines[1]).toContain("not by EQUIFAX"); // discrepancy text present, quoted since it may contain a comma
  });

  it("quote-escapes a discrepancies field containing a comma", () => {
    const result = buildReconciliation([
      { bureau: "EXPERIAN", reportId: "r1", uploadedAt: "2026-01-01", sourceFileName: "e.pdf", accounts: [account({ status: "DEFAULT" })] },
      { bureau: "EQUIFAX", reportId: "r2", uploadedAt: "2026-01-02", sourceFileName: "q.pdf", accounts: [account({ id: "acc-2", status: "ACTIVE" })] },
    ]);
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;

    const csv = reconciliationToCsv(result);
    const discrepancyLine = csv.split("\r\n")[1];
    // "Status differs by bureau: EXPERIAN = DEFAULT, EQUIFAX = ACTIVE." contains a comma, so the field must be quoted.
    expect(discrepancyLine).toMatch(/"Status differs by bureau: EXPERIAN = DEFAULT, EQUIFAX = ACTIVE\."/);
  });
});
