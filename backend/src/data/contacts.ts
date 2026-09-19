/**
 * Reference contact details for UK credit reference agencies and the
 * court centre that handles most County Court Judgments.
 *
 * We deliberately do NOT ship a directory of individual lenders'
 * addresses here — those vary by lender, change over time, and a wrong
 * one misdirects a real dispute letter. Lender contact details are
 * user-entered instead (see Lender.contactAddress).
 *
 * Bureau/court addresses below were checked against each organisation's
 * own site on 2026-09-16 (see sourceUrl). Postal addresses for large
 * organisations do change occasionally and some (Experian in particular)
 * use different addresses for different request types — always confirm
 * against the linked page before posting something time-sensitive.
 */

export interface ContactEntry {
  name: string;
  role: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  sourceUrl: string;
  note?: string;
}

export const BUREAU_CONTACTS: Record<"EXPERIAN" | "EQUIFAX" | "TRANSUNION", ContactEntry> = {
  EXPERIAN: {
    name: "Experian",
    role: "Credit reference agency",
    addressLines: ["Experian", "PO Box 8000", "Nottingham", "NG80 7WF"],
    sourceUrl: "https://www.experian.co.uk/consumer/contact-us.html",
    note: "Experian uses different addresses for different request types — confirm the correct one for a dispute/correction on the page above before posting.",
  },
  EQUIFAX: {
    name: "Equifax",
    role: "Credit reference agency",
    addressLines: ["Equifax Ltd", "Customer Service Centre", "PO Box 10036", "Leicester", "LE3 4FS"],
    sourceUrl: "https://www.equifax.co.uk/contact-us",
  },
  TRANSUNION: {
    name: "TransUnion",
    role: "Credit reference agency",
    addressLines: ["TransUnion Consumer Services Team", "PO Box 647", "Unit 4", "Hull", "HU9 9QZ"],
    phone: "0330 024 7574",
    email: "UKConsumer@transunion.com",
    sourceUrl: "https://www.transunion.co.uk/consumer/support/contact",
  },
};

export const COURT_CONTACT: ContactEntry = {
  name: "Civil National Business Centre (CNBC)",
  role:
    "Handles County Court Judgments issued via Money Claim Online for England & Wales (this replaced the old \"County Court Business Centre\"). If your CCJ was issued by a different county court, contact that court directly instead — use the case number on your judgment.",
  addressLines: ["Civil National Business Centre", "St Katharine's House", "21-27 St Katharine's Street", "Northampton", "NN1 2LH"],
  phone: "0300 303 5174",
  sourceUrl: "https://www.find-court-tribunal.service.gov.uk/courts/civil-national-business-centre-cnbc",
  note: "Always quote your claim number. To get a Certificate of Satisfaction once a judgment is paid, file form N443 with the issuing court.",
};

/**
 * The Information Commissioner's Office — under CCA 1974 s.159(8), the
 * ICO ("the relevant authority" for an individual, as opposed to the FCA
 * for partnerships/unincorporated bodies) is who a consumer applies to if
 * a credit reference agency doesn't act on a s.159 correction/notice-of-
 * correction request properly. This is a genuinely different remedy from
 * the Financial Ombudsman Service below — see FOS_CONTACT's note.
 *
 * IMPORTANT: the ICO announced in June 2025 that its head office is
 * relocating from Wilmslow to Manchester, with the move expected around
 * autumn 2026 — i.e. possibly already underway as this address was
 * checked. Confirm the current address on the page below before posting
 * anything time-sensitive.
 */
export const ICO_CONTACT: ContactEntry = {
  name: "Information Commissioner's Office (ICO)",
  role:
    "The UK's data protection regulator. For a Consumer Credit Act 1974 s.159 dispute, this is who to escalate to if a credit reference agency doesn't respond properly to a correction request or a notice of correction — not the Financial Ombudsman Service.",
  addressLines: ["Information Commissioner's Office", "Wycliffe House", "Water Lane", "Wilmslow", "Cheshire", "SK9 5AF"],
  phone: "0303 123 1113",
  sourceUrl: "https://ico.org.uk/global/privacy-notice/controller-s-contact-details/",
  note: "The ICO is relocating its head office from Wilmslow to Manchester around autumn 2026 — double-check this address on the page above before posting anything time-sensitive.",
};

/**
 * The Financial Ombudsman Service — for complaints about how a
 * *regulated firm* (a bank, lender, or debt collector) has conducted
 * itself, e.g. an unfair debt collection practice or a mishandled
 * complaint. This is NOT the escalation route for a credit reference
 * agency's data-correction duties under CCA 1974 s.159 — that goes to
 * the ICO above. The two are easy to conflate; this app deliberately
 * keeps them distinct.
 */
export const FOS_CONTACT: ContactEntry = {
  name: "Financial Ombudsman Service (FOS)",
  role:
    "Handles complaints about how a regulated financial firm (a bank, lender, or debt collector) has treated you — for example an unfair debt collection practice. Use this for a conduct complaint against a firm, not for a credit reference agency's data-correction duties (that's the ICO, above).",
  addressLines: ["Financial Ombudsman Service", "Exchange Tower", "London", "E14 9SR"],
  phone: "0800 023 4567",
  sourceUrl: "https://www.financial-ombudsman.org.uk/contact-us",
};

export const CONTACTS_LAST_VERIFIED = "2026-09-19";
