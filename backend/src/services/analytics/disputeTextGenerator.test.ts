import { describe, expect, it } from "vitest";
import {
  buildDisputeLetterParts,
  countWords,
  DisputeLetterInput,
  generateDisputeText,
  listDisputeTemplates,
  NOTICE_OF_CORRECTION_WORD_LIMIT,
} from "./disputeTextGenerator";

const BASE_INPUT: DisputeLetterInput = {
  bureau: "EXPERIAN",
  applicantName: "JORDAN SMITH",
  dateOfBirth: "1988-03-14",
  identityAlertMessages: ["Account C2 is recorded under a different name and date of birth."],
  ccjs: [],
  activeDefaults: [],
  senderName: "Jordan Smith",
  senderAddress: "12 Sample Street\nLeeds\nLS1 4AB",
};

describe("countWords", () => {
  it("counts whitespace-separated words", () => {
    expect(countWords("This account is not mine.")).toBe(5);
  });

  it("treats an empty or whitespace-only string as zero words", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });
});

describe("generateDisputeText — notice_of_correction", () => {
  it("never describes the letter as legally binding", () => {
    const text = generateDisputeText({ ...BASE_INPUT, correctionStatement: "This entry is wrong." }, "notice_of_correction");
    expect(text.toLowerCase()).not.toContain("legally binding");
    expect(text).toContain("formal statutory notice");
  });

  it("quotes the user's own correction statement verbatim rather than paraphrasing it", () => {
    const statement = "This account was opened fraudulently by a third party. I am not liable for this debt.";
    const text = generateDisputeText({ ...BASE_INPUT, correctionStatement: statement }, "notice_of_correction");
    expect(text).toContain(statement);
  });

  it("cites the correct statutory subsections — 159(3) for the notice itself, 159(4) for the confirmation deadline, and 159(8) for ICO escalation", () => {
    const text = generateDisputeText({ ...BASE_INPUT, correctionStatement: "Wrong entry." }, "notice_of_correction");
    expect(text).toContain("section 159(3)");
    expect(text).toContain("section 159(4)");
    expect(text).toContain("section 159(8)");
  });

  it("routes escalation to the Information Commissioner's Office, not the Financial Ombudsman Service", () => {
    const text = generateDisputeText({ ...BASE_INPUT, correctionStatement: "Wrong entry." }, "notice_of_correction");
    expect(text).toContain("Information Commissioner's Office");
    expect(text.toLowerCase()).not.toContain("financial ombudsman");
  });

  it("falls back to a fillable placeholder — never a generated statement — when the user hasn't written one yet", () => {
    const text = generateDisputeText(BASE_INPUT, "notice_of_correction");
    expect(text).toContain("[Write your own statement here");
  });

  it("warns inline when the statement exceeds the 200-word statutory limit, without altering the statement itself", () => {
    const longStatement = Array.from({ length: NOTICE_OF_CORRECTION_WORD_LIMIT + 20 }, () => "word").join(" ");
    const text = generateDisputeText({ ...BASE_INPUT, correctionStatement: longStatement }, "notice_of_correction");
    expect(text).toContain(longStatement);
    expect(text).toContain("over the 200-word limit");
  });

  it("is marked relevant only when the report actually has an identity-type finding", () => {
    const withFinding = listDisputeTemplates(BASE_INPUT).find((t) => t.id === "notice_of_correction");
    const withoutFinding = listDisputeTemplates({ ...BASE_INPUT, identityAlertMessages: [] }).find((t) => t.id === "notice_of_correction");
    expect(withFinding?.relevant).toBe(true);
    expect(withoutFinding?.relevant).toBe(false);
  });
});

describe("buildDisputeLetterParts", () => {
  it("splits the same letter into sender/recipient/date/body without changing its content", () => {
    const input = { ...BASE_INPUT, correctionStatement: "This entry is wrong." };
    const parts = buildDisputeLetterParts(input, "notice_of_correction");
    const flattened = [...parts.senderLines, "", ...parts.recipientLines, "", parts.date, "", ...parts.bodyLines].join("\n");
    expect(flattened).toBe(generateDisputeText(input, "notice_of_correction"));
  });

  it("addresses the notice of correction to the credit reference agency, like the identity and general accuracy templates", () => {
    const parts = buildDisputeLetterParts(BASE_INPUT, "notice_of_correction");
    expect(parts.recipientLines).toEqual(["Experian", "PO Box 8000", "Nottingham", "NG80 7WF"]);
  });
});
