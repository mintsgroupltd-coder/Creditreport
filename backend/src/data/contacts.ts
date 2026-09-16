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

export const CONTACTS_LAST_VERIFIED = "2026-09-16";
