import { describe, expect, it } from "vitest";
import { buildDocumentPins } from "./documentPins";

const RAW_TEXT = `
Personal details
Name: JORDAN SMITH
Date of birth: 14-03-1988

Account C11
Lender: Acme Bank
Status: Default
Balance: 450

Account C12
Lender: Beta Loans
Status: Active
`;

describe("buildDocumentPins", () => {
  it("anchors a pin to the account's bureau reference when it's present in the text", () => {
    const pins = buildDocumentPins(
      RAW_TEXT,
      [{ id: "alert-1", type: "ACTIVE_DEFAULT", severity: "CRITICAL", message: "Account C11 is in default.", relatedRefs: { accountRef: "C11" } }],
      [
        { id: "acc-1", bureauRef: "C11", lender: { name: "Acme Bank" } },
        { id: "acc-2", bureauRef: "C12", lender: { name: "Beta Loans" } },
      ]
    );
    expect(pins).toHaveLength(1);
    expect(pins[0].anchor).toBe("C11");
    expect(pins[0].startIndex).not.toBeNull();
    expect(RAW_TEXT.slice(pins[0].startIndex!, pins[0].endIndex!).toUpperCase()).toBe("C11");
  });

  it("doesn't confuse a short ref with a longer one that starts the same way (word-boundary matching)", () => {
    const text = "Account C1 details here. Account C11 details here.";
    const pins = buildDocumentPins(
      text,
      [{ id: "alert-1", type: "ACTIVE_DEFAULT", severity: "WARNING", message: "msg", relatedRefs: { accountRef: "C1" } }],
      [{ id: "acc-1", bureauRef: "C1", lender: { name: "Acme Bank" } }]
    );
    expect(pins[0].startIndex).toBe(text.indexOf("C1 details"));
  });

  it("falls back to the lender's name when the bureau ref itself isn't found in the text", () => {
    const pins = buildDocumentPins(
      RAW_TEXT,
      [{ id: "alert-1", type: "ACTIVE_DEFAULT", severity: "CRITICAL", message: "msg", relatedRefs: { accountRef: "ZZ-NOT-IN-TEXT" } }],
      [{ id: "acc-1", bureauRef: "ZZ-NOT-IN-TEXT", lender: { name: "Acme Bank" } }]
    );
    expect(pins[0].anchor).toBe("Acme Bank");
    expect(pins[0].startIndex).not.toBeNull();
  });

  it("returns null indexes, not a guessed position, when nothing in the alert can be located in the text", () => {
    const pins = buildDocumentPins(
      RAW_TEXT,
      [{ id: "alert-1", type: "SEARCH_VOLUME", severity: "INFO", message: "Lots of searches recently.", relatedRefs: null }],
      []
    );
    expect(pins[0].startIndex).toBeNull();
    expect(pins[0].endIndex).toBeNull();
    expect(pins[0].anchor).toBeNull();
  });

  it("gives every alert a human-readable label distinct from the raw enum value", () => {
    const pins = buildDocumentPins(RAW_TEXT, [{ id: "alert-1", type: "DOB_MISMATCH", severity: "CRITICAL", message: "msg", relatedRefs: null }], []);
    expect(pins[0].label).toBe("Date of birth mismatch");
  });
});
