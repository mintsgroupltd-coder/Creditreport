# Credit Report Analyzer

A full-stack app for uploading a UK credit report (PDF or CSV — Experian,
Equifax, or TransUnion) and getting back a structured breakdown of every
account, an automatic negative-marker and identity-anomaly scan, a
plain-English risk summary, and ready-to-send dispute text.

This README covers the project structure, the key backend routes and
data model, the key frontend components, and — in the most detail —
how the parsing and analytics engines actually work, since that's the
part worth understanding before you extend it.

## Status and scope

This is a working scaffold, not a hardened production system. Specifically:

- **The Experian parser is real and tested.** It was built against, and
  validated line-by-line against, an actual Experian UK consumer
  report — see [§ Parsing engine](#parsing-engine) for exactly what
  that testing found (including a real data-quality bug in how
  Experian itself represents "satisfied" defaults, which the parser
  now works around).
- **Equifax and TransUnion are best-effort.** Neither bureau's report
  layout was available to build and test a dedicated parser against,
  so both currently fall back to a generic keyword/pattern scanner
  (`genericFallbackParser.ts`). Expect lower accuracy — the UI surfaces
  a warning whenever this path is used. See that section for how to
  upgrade either to a dedicated parser once you have a real sample.
- **Auth is email+password only**, JWT-based with bcrypt hashing, plus a
  token-based forgot/reset-password flow (see § Password reset below).
  OAuth isn't wired up — `auth.controller.ts` has a comment on the
  cleanest way to add it (Passport.js).
- **Login, signup and upload are rate-limited** (`middleware/rateLimit.ts`,
  via `express-rate-limit`) — 20 auth attempts per 15 minutes and 30
  uploads per hour, both keyed by IP. Tune the limits there if they're
  too tight/loose for your deployment.
- **A starter test suite exists** (`npm test`, via Vitest):
  `src/services/parsing/experianParser.test.ts` covers block splitting
  despite the glued reference headers, glued-label extraction, the
  SATISFIED-vs-DEFAULT corroboration logic, CCJ/search parsing, and the
  no-accounts-found warning path;
  `src/services/analytics/disputeTextGenerator.test.ts` covers the
  formal notice-of-correction letter (correct statutory citations, ICO
  not FOS, never "legally binding", the statement quoted verbatim
  rather than paraphrased, the 200-word-limit warning) and the
  electoral-roll supporting line (added only when explicitly true, and
  only to identity-type letters); `src/services/analytics/identityCheck.test.ts`
  covers the profile-vs-report comparison (unconfirmed profile, name
  match tolerant of word order, name/DOB mismatches, and the
  nothing-to-compare case). The analytics engine's internal anomaly
  detection and the other parsers still don't have coverage — this is
  a starting point, not a finished suite.
- **Phases 1 and 2 of the auditor/dispute-engine work are in place** —
  see [§ Statutory dispute tools](#statutory-dispute-tools) for the
  notice-of-correction template, envelope-ready PDF export, and
  postage-record/milestone tracker; [§ Confirmed identity vs. report
  data](#confirmed-identity-vs-report-data) for the self-declared
  profile identity that now feeds the anomaly checks and letters, and
  the sample-vs-real report badge. Phase 3 (a visual PDF inspector and
  tri-bureau reconciliation) isn't built yet.
- **Prisma's engine binaries need internet access to install.**
  `npx prisma generate` downloads a query-engine binary on first run.
  If you're behind a restrictive proxy/firewall, allow
  `binaries.prisma.sh` or see Prisma's docs for offline/custom-engine
  options. Because of this, the schema is still synced with
  `prisma db push` on every boot (see `backend/package.json`'s `start`
  script) rather than through committed migration files — run
  `npx prisma migrate dev` yourself once you have unrestricted network
  access, to get real migration files under version control.

## Project structure

```
credit-report-analyzer/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # data model — see § Data model
│   │   └── seed.ts                # synthetic demo user + report
│   ├── src/
│   │   ├── config/                # env loading, Prisma client instance
│   │   ├── middleware/             # auth (JWT), rate limiting, upload (multer), error handler
│   │   ├── routes/                 # auth, reports, accounts, contacts, profile, disputes
│   │   ├── controllers/            # request handlers — thin, delegate to services
│   │   ├── services/
│   │   │   ├── parsing/            # § Parsing engine — the core of this app (has a test suite)
│   │   │   ├── analytics/          # § Analytics engine
│   │   │   └── reportPersistence.ts # ParsedReport -> Prisma rows, in one transaction
│   │   ├── data/contacts.ts        # verified bureau/court postal addresses
│   │   ├── utils/                  # jwt, mailer (password reset), pdf text extraction, csv reading
│   │   └── index.ts                # Express app bootstrap
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/                    # fetch client + response types
│   │   ├── context/AuthContext.tsx # login/register/logout, token in localStorage
│   │   ├── components/             # StatCard, RiskBadge, AlertList, AccountTable, AccountTimeline,
│   │   │                           # AppShell, BarChart, BalanceChart, ContactsPanel, DisputeTracker,
│   │   │                           # ComparisonPanel
│   │   ├── pages/                  # Login, Signup, ForgotPassword, ResetPassword, Settings, Dashboard,
│   │   │                           # ReportDetail, AccountDetail
│   │   └── App.tsx                 # routes + auth guard
│   └── package.json
├── docker-compose.yml               # Postgres + API for local dev
└── README.md
```

## Running it locally

```bash
# 1. Database
docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env        # edit JWT_SECRET at minimum
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed                 # optional: creates demo@example.com / demo-password-123
npm run dev                  # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Upload a PDF or CSV from the dashboard, or log in as the seeded demo
user to see a report that's already been parsed and analysed.

Run the backend's test suite with `npm test` (from `backend/`).

### Password reset — optional SMTP setup

Forgot/reset password works out of the box, but without SMTP configured
the reset link is only logged to the backend console rather than
emailed (safe for local dev, useless for real users). To send real
emails, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and
optionally `SMTP_FROM` on the backend service; also set `FRONTEND_URL`
if it differs from `CORS_ORIGIN`'s first entry (the reset link is built
from whichever of the two is set).

## Deploying it to the web

There's a `render.yaml` at the project root that describes the whole
stack (Postgres + backend + frontend) as a Render Blueprint, so Render
can create and wire up all three from a single click once the code is on
GitHub. See **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)** for the exact,
copy-pasteable steps (create the repo, push, deploy the blueprint, link
the two services together). It works the same way on Railway or any other
git-based host — `render.yaml` is just documentation of the build/start
commands in that case.

## Data model

Defined in `backend/prisma/schema.prisma`:

- **User** — email + bcrypt password hash, a hashed password-reset
  token + expiry (never the raw token — see § Password reset), and the
  account holder's own **self-declared** identity: `fullName` /
  `postalAddress` / `dateOfBirth` (used to auto-fill dispute letters —
  see `profile.controller.ts`), `electoralRollRegistered` (a tri-state
  self-declaration, never checked against an actual register), and
  `identityConfirmedAt` (set once all three of name/DOB/address are
  filled in — see § Confirmed identity vs. report data below).
- **Report** — one row per upload. Holds the bureau, the applicant's
  name/DOB/addresses *as read off the report itself* (not the user's
  account details — these can and do differ, which is exactly what
  the DOB-mismatch check, and the separate profile-vs-report check,
  look for), the raw extracted text (kept so re-analysis never needs a
  re-upload), the risk summary computed at upload time, and `isSample`
  (true only for `prisma/seed.ts`'s fixture report, so the UI can badge
  it clearly rather than let it be mistaken for a real upload).
- **Lender** — deduplicated by a normalized name
  (`normalizeLenderName()` strips "LTD"/"PLC"/etc and punctuation), so
  "JC International Acquisition LLC" appearing on three different
  accounts collapses to one Lender row instead of three. Also carries
  an optional user-entered `contactAddress`.
- **Account** — one row per credit facility (a card, loan, utility
  account, etc). Carries both the current snapshot (balance, limit,
  status) and the default/satisfaction dates that drive most of the
  analytics.
- **AccountStatusEntry** — the monthly balance/status-code history
  that powers the account timeline view. One row per month.
- **Event** — anything else dated: a CCJ, a default, a search/enquiry,
  an electoral roll entry, a linked address. Optionally tied back to
  an Account.
- **Alert** — the output of the analytics engine, persisted at upload
  time so the dashboard doesn't need to recompute it on every page
  load.
- **DisputeRecord** — a log entry created when the user marks a
  generated dispute letter as sent: which template, who it went to,
  when, a suggested follow-up deadline (`responseDeadline` +
  `deadlineBasis` — `"statutory"` for the 28-day CRA investigation
  window, `"advisory"` for a suggested follow-up point on letters with
  no fixed legal deadline), and its status (`SENT` / `RESOLVED` /
  `NO_RESPONSE`). Powers the "Progress over time" and "Disputes sent"
  sections on the report page.

## Key backend routes

All routes except `/api/auth/*` require `Authorization: Bearer <token>`
(`middleware/auth.ts`). `/api/auth/*` and the report-upload route are
also rate-limited (`middleware/rateLimit.ts`).

| Method & path | What it does |
|---|---|
| `POST /api/auth/register` | Create an account, returns a JWT |
| `POST /api/auth/login` | Returns a JWT |
| `POST /api/auth/forgot-password` | Always returns the same generic message; if the email matches an account, emails (or, without SMTP configured, logs) a password-reset link |
| `POST /api/auth/reset-password` | Body `{ token, password }` — sets a new password if the token is valid and unexpired (1 hour) |
| `POST /api/reports` | Multipart upload (`file` field, PDF or CSV) → extract text → parse → persist → returns `{ reportId, riskSummary }` |
| `GET /api/reports` | List the caller's reports with account/alert counts |
| `GET /api/reports/:id` | Full report detail: stats, accounts, events, alerts (each with `relatedAccountIds`), `insights` (risk level, plain-English summary, suggested actions), `negativeMarkers` (CCJ/default/utilisation/search counts and totals), and `identityCheck` (live comparison of this report's own application details against the caller's confirmed profile — see § Confirmed identity vs. report data) |
| `GET /api/reports/:id/compare` | Compares this report's stats/negative markers/risk level against the user's most recent earlier report (same bureau preferred), for tracking progress after a dispute — returns `{ hasPrevious: false }` if there isn't one |
| `GET /api/reports/:id/dispute-templates` | Lists the dispute letter templates available for this report (`auto`, `identity`, `ccj`, `default_validation`, `general_accuracy`, `notice_of_correction`), each flagged `relevant: true/false` based on what was actually found on the report |
| `GET /api/reports/:id/dispute-text?template=<id>&correctionStatement=<text>` | Plain-text dispute letter body for the chosen template (defaults to `auto`), built from the report's already-persisted alerts/events/accounts plus the caller's saved name/address if set. `correctionStatement` is only used by `notice_of_correction` — see § Statutory dispute tools below |
| `GET /api/reports/:id/dispute-pdf?template=<id>&correctionStatement=<text>&envelope=<c5\|dl>&signature=<digital\|blank>` | The same letter as a downloadable PDF (`pdfkit`). With no `envelope`, it's a plain formatted letter as before; `envelope=c5`/`dl` instead lays the recipient address out inside that envelope's window position with dashed fold guides and appends an itemised schedule of the disputed CCJs/defaults — see § Statutory dispute tools |
| `DELETE /api/reports/:id` | Delete a report (cascades to its accounts/events/alerts) — lets a user re-upload a corrected or newer file |
| `GET /api/accounts/:id` | One account's detail (including `lenderContactAddress`) plus its merged timeline (monthly history + dated events) |
| `PATCH /api/accounts/:id/lender-contact` | Set or clear the postal address for that account's lender (shared across every account for the same lender) |
| `GET /api/contacts` | Verified UK postal addresses/contact details for Experian, Equifax, TransUnion, the CCJ court centre (Civil National Business Centre), the ICO, and the Financial Ombudsman Service |
| `GET /api/profile` / `PATCH /api/profile` | Read/update the caller's self-declared `fullName` / `postalAddress` / `dateOfBirth` / `electoralRollRegistered`; response includes `identityConfirmed` (true once name/DOB/address are all set) — see § Confirmed identity vs. report data |
| `POST /api/disputes` | Body `{ reportId, templateId, recipient }` — logs that a dispute letter was sent, with a computed follow-up deadline |
| `GET /api/disputes?reportId=<id>` | Lists dispute records for a report |
| `PATCH /api/disputes/:id` | Body `{ status?, notes? }` — mark a dispute `RESOLVED` / `NO_RESPONSE`, or add notes |
| `GET /api/disputes/:id/tracking-sheet-pdf?service=<text>&cost=<text>` | A plain, unbranded "postage record" PDF for one logged dispute — see § Statutory dispute tools |

`uploadReport` (`controllers/reports.controller.ts`) is the whole
pipeline in one place: extract text → `parseReportText()` →
`saveParsedReport()` → respond with the risk summary immediately, so
the frontend can redirect straight to the report detail page without
a second round trip.

## Key frontend components

- **`AppShell`** — header/nav wrapper used by every authenticated page.
- **`StatCard`** — the dashboard's big-number tiles (account counts, balances).
- **`RiskBadge`** — LOW/MEDIUM/HIGH/SEVERE pill, also reused for alert severities.
- **`AlertList`** — renders `Alert` rows with a severity dot, a human
  label (`DOB_MISMATCH` → "Date of birth mismatch", etc), and — expanded
  per row — plain-English "what it means" / "what to do" guidance plus
  links through to the specific account(s) the alert relates to.
- **`AccountTable`** — the accounts grid on the report page: searchable
  by lender/type, sortable by lender or balance, links each row through
  to `AccountDetailPage`.
- **`AccountTimeline`** — vertical timeline combining monthly
  balance/status points and dated events into one sorted list.
- **`BarChart`** — small horizontal bar chart (alerts by severity,
  accounts by status).
- **`BalanceChart`** — inline SVG line/area chart of an account's
  balance history over time.
- **`ContactsPanel`** — verified postal addresses for the three credit
  bureaus (the report's own bureau highlighted) and the CCJ court
  centre, each linking back to the organisation's own contact page.
- **`DisputeTracker`** — the list of logged dispute letters for a
  report, with a status pill and a deadline badge (overdue/soon/OK,
  labelled "response window" for the statutory 28-day CRA deadline vs
  "suggested follow-up" for the advisory ones), a "Tracking sheet"
  download button, an ICO escalation note once a statutory deadline has
  passed, plus buttons to mark a dispute resolved or unanswered.
- **`ComparisonPanel`** — a before/after table of risk level and
  negative markers against the user's previous report, with
  improved/worse deltas (a decrease in CCJs/defaults/etc is "better").

Pages: `DashboardPage` (list + upload, with a "how it works" walkthrough
for new users and a "Sample data" badge on the seeded fixture report),
`ReportDetailPage` (a profile-vs-report identity-check banner, risk
summary and suggested actions, charts, negative-markers table,
progress-over-time comparison, useful contacts, a dispute-template
picker — including envelope (C5/DL) and signature-mode (typed/blank)
selectors for the PDF export, and a 200-word statement box with a live
counter when the "notice of correction" template is picked — with
copy-to-clipboard/PDF export and sent-dispute tracking, alerts,
accounts, and a delete button so a report can be removed and
re-uploaded), `AccountDetailPage` (single account, an editable
lender/agent contact address, balance chart, and timeline),
`SettingsPage` (self-declared name/date of birth/address for letter
auto-fill and the profile-vs-report check, an electoral-roll
registration note, and a confirmed/not-confirmed identity banner — all
explicitly labelled as self-declared, never independently verified),
`ForgotPasswordPage` / `ResetPasswordPage`. Auth state lives in
`AuthContext` and the JWT sits in `localStorage`.

## Statutory dispute tools

Phase 1 of the "statutory dispute engine" work. Everything here is
addressed to the credit reference agency (or, where noted, is neutral
paperwork) — Phase 2/3 (verified identity, PDF inspector, tri-bureau
reconciliation) aren't built yet.

- **Formal statutory notice of correction** (`notice_of_correction`
  template, `disputeTextGenerator.ts`) implements section 159(3) of the
  Consumer Credit Act 1974: after a CRA has declined to remove/amend an
  entry, an individual can require them to add a correction statement of
  up to 200 words, **which the Act requires the individual to draw up
  themselves** — the app never generates or paraphrases this statement,
  only quotes it verbatim (`ReportDetailPage`'s correction-statement box
  has a live word counter matching `NOTICE_OF_CORRECTION_WORD_LIMIT`,
  and the generated letter itself warns inline if the statement is over
  the limit rather than silently truncating it). Wording throughout is
  "formal statutory notice" — deliberately never "legally binding",
  which would overstate what a self-generated letter can do on its own.
  The letter cites s.159(4)'s 28-day confirm-receipt deadline and
  s.159(8)'s escalation authority (see below).
- **ICO vs FOS.** Section 159(8) of the Act names the Information
  Commissioner's Office as "the relevant authority" an *individual*
  applies to if a CRA doesn't act properly on a s.159 request — not the
  Financial Ombudsman Service, which is a separate route for complaints
  about how a regulated firm (a bank, lender, or debt collector) has
  behaved. Both are verified contacts in `data/contacts.ts`
  (`ICO_CONTACT`, `FOS_CONTACT`), and the app is careful to cite the
  correct one everywhere a deadline or escalation is mentioned
  (`disputes.controller.ts`'s milestone builder,
  `DisputeTracker`'s escalation note). **Note:** the ICO announced in
  2025 that it's relocating its head office from Wilmslow to Manchester
  around autumn 2026 — the address on file was checked 2026-09-19 but
  may already be out of date; it links straight to the ICO's own page.
- **Envelope-ready PDF export** (`services/pdf/disputeLetterPdf.ts`).
  With `envelope=c5` or `envelope=dl` on the PDF-export routes, the
  recipient's address is positioned to show through that window
  envelope once the sheet is folded, with dashed fold guides and a
  faint outline of the window itself so it's obvious before printing
  whether the address actually fits:
  - **C5** (A4 folded once, in half): window position (20mm from the
    left, 60mm from the top of the flat sheet) is well corroborated by
    UK print-industry guidance.
  - **DL** (A4 folded twice, in three): no single UK-official spec
    could be confirmed (Royal Mail's own guide is blocked by
    `robots.txt`, and supplier pages were inconsistent or unavailable),
    so the DL figures are the best available reference (the DIN 680
    convention) rather than a specification — the app says so
    explicitly, both in the UI and printed on the PDF itself, and
    recommends a test-fold before using it for anything time-sensitive.
  The export also appends an itemised schedule of the letter's CCJs and
  active defaults on a second page, and a signature-mode toggle
  (`signature=digital`, the default — a typed name explicitly labelled
  "not a signature or official seal" — vs `signature=blank`, which
  leaves a blank line for a wet-ink signature instead).
- **Postage record / milestone tracker**
  (`services/pdf/trackingSheetPdf.ts`, `GET
  /api/disputes/:id/tracking-sheet-pdf`). A deliberately plain, unbranded
  PDF — no Post Office/Royal Mail names, logos, or "proof of posting
  certificate" styling — with fields for the service used, cost, and a
  blank box to note the counter reference, plus a reminder to keep the
  real receipt from the counter with it. Below that, a milestone table
  computed from when the dispute was logged: for a statutory CRA
  letter, the s.159(2)/(4) response deadline and the date ICO
  escalation becomes available; for an advisory letter (CCJ/debt
  validation), just a suggested follow-up date, since those have no
  fixed statutory deadline or s.159 escalation route.

## Confirmed identity vs. report data

Phase 2 of the auditor/dispute-engine work: a logged-in user's own
stated identity now feeds the anomaly checks and letters, kept
strictly separate from whatever a given report claims about itself.

- **What "confirmed" means, precisely.** `GET/PATCH /api/profile`
  (`profile.controller.ts`) now also accepts `dateOfBirth` and
  `electoralRollRegistered`. Once `fullName`, `dateOfBirth` and
  `postalAddress` are all non-blank, `identityConfirmedAt` is set and
  the API reports `identityConfirmed: true`. This means **the account
  holder has stated all three fields themselves** — nothing here is
  checked against DVLA, the electoral roll, a CRA, or any other
  official register, because the app has no access to one. Every place
  this is surfaced (Settings, the report page) says so explicitly,
  the same way the envelope/contact-address caveats elsewhere in this
  app never overstate what's actually been checked.
- **The profile-vs-report check**
  (`services/analytics/identityCheck.ts`, `checkProfileIdentityMatch`).
  The existing anomaly engine (`anomalyDetection.ts`) only ever
  compared each *account* against the report's own "Application
  Details" section — it had no way to catch the report's own applicant
  block itself being wrong (wrong file uploaded, or the bureau's own
  top-level record is off). This new check compares the report's
  self-reported name/DOB against the user's separately confirmed
  profile instead, reusing the exact same order-insensitive name
  matching (`nameTokens`/`sameTokenSet`, now exported from
  `anomalyDetection.ts` so the two never drift). It's computed **live**
  in `GET /api/reports/:id` (new `identityCheck` field) and inside
  `buildDisputeLetterInput`, rather than persisted as an `Alert` at
  upload time — so filling in your profile *after* uploading a report
  still checks it correctly, with no backfill needed. A mismatch is
  folded into `identityAlertMessages` alongside the internal checks, so
  it shows up in the identity and notice-of-correction letters too.
- **Electoral roll registration** is purely a supporting line: when
  `electoralRollRegistered === true`, the identity and
  notice-of-correction letters add one sentence noting it (CRAs
  themselves often weigh electoral roll status when resolving an
  identity/address dispute); `false` or unset adds nothing — a letter
  arguing your own case shouldn't volunteer information that weakens
  it, and this app never fabricates evidence either way.
- **Sample vs. real data.** `prisma/seed.ts`'s fixture report is now
  the only report ever created with `isSample: true`; the dashboard and
  report page both badge it "Sample data" so a demo/dev account's
  fictional report is never confused with — or, since each user only
  sees their own reports, mixed up with — a real upload.

## Parsing engine

Entry point: `services/parsing/index.ts` → `parseReportText(rawText)`
for PDFs, `parseReportCsv(rows)` for CSVs. Both return the same
`ParsedReport` shape (`services/parsing/types.ts`) — nothing
downstream knows or cares which bureau or file format produced it.

### Experian (`experianParser.ts`) — built and tested against a real report

Every block on an Experian "printable version" report — an account, a
judgment, a search, an electoral roll entry, a linked address — starts
with a short reference **glued directly onto its first line**, no
space:

```
C12MR OLA TAYO, 73, ROBINIA AVENUE, ... DA11 9QFDate of Birth:10/10/1971
```

That's the reliable anchor. The parser splits the whole document into
blocks on lines starting with `C`/`J`/`P`/`E`/`B` + digits, then runs a
block-type-specific extractor on each one. A few things that only
became clear from testing against a real export (`pdf-parse`'s text
output collapses all table structure to plain lines, which breaks
naive assumptions):

1. **`\b` doesn't work as the boundary after the ref number.** A digit
   and the letter that follows it (`"C1MR"`) are both word characters,
   so `\d+\b` never matches there — the very first version of this
   parser silently matched zero blocks. Fixed with a lookahead instead
   (`(?=[A-Z])`).
2. **Two labels can be glued onto one line** with no separator:
   `"Settlement Date:06/09/2022Updated To:09/10/2022"`. A naive
   "capture everything up to the next label" approach works for text
   fields but actively breaks for the *last* label in a block (usually
   `Updated To` or `Credit Limit`) — with no next label to stop at, a
   lazy match swallows the rest of the block, including the monthly
   status-history table, before hitting end-of-string. The fix is
   `extractLabels()` using a **tight value pattern per label type**
   (a `\d{1,2}/\d{1,2}/\d{4}` for date fields, a money-or-word pattern
   for balance fields) rather than "everything until the next label."
3. **The "Current Balance: SATISFIED" field isn't always trustworthy
   on its own.** Testing against the real report turned up an account
   where Experian shows `Current Balance: SATISFIED` with **no**
   Satisfaction Date and a monthly balance history that keeps growing
   — i.e. the summary label and the underlying data disagree. The
   parser now only classifies a defaulted account as `SATISFIED` when
   a Satisfaction/Settlement Date actually corroborates it
   (`classifyAccountStatus()` in `shared.ts`); otherwise it stays
   `DEFAULT` and a parser warning is attached, because trusting the
   label alone would make a real unresolved debt silently disappear
   from the totals. This is a good example of exactly the kind of
   thing the analytics engine (and a human skimming the PDF) can
   miss — treat this as a demonstration that "read the label at face
   value" isn't a safe default when building this kind of tool.
4. **Monthly status/status-code history is best-effort beyond 24
   months.** The 1–12 and 13–24 month grids parse cleanly (status
   codes and £-prefixed balances are each individually delimited, so
   they split apart reliably). The "25+ months" blocks print coarser,
   ungrouped history without per-slot dates, and are recorded as a
   parser warning rather than expanded — see `extractStatusHistory()`
   for exactly where that cutoff is, if you want to extend it.

### CSV (`csvAccountParser.ts`)

One row per account. Column headers are matched case-insensitively
against a small alias list (`lender`/`company`/`creditor`,
`current balance`/`balance`, etc) rather than one fixed schema, since
every export tool names columns slightly differently.

### Equifax / TransUnion / anything unrecognised (`genericFallbackParser.ts`)

No dedicated block parser exists for these yet (no real sample to
validate against — see the top-level warning). This scans line by
line for default/arrears/CCJ/search keywords near a date and a
£-amount, and seeds "shaped" account rows from lines that look like
`Lender name ... £amount ... date`. It's intentionally conservative
and will under-extract compared to the Experian parser; every report
parsed this way carries a warning saying so.

**To upgrade Equifax or TransUnion to a real parser:** get a sample
export, find its equivalent of the "glued block reference" (or
whatever its actual delimiter is), and write a new file mirroring
`experianParser.ts`'s structure — split into blocks, extract labels
per block type, return a `ParsedReport`. Swap the one-line delegation
in `equifaxParser.ts` / `transunionParser.ts` for the new function.

## Analytics engine

Entry point: `services/analytics/riskSummary.ts` → `buildRiskSummary(report)`,
run once at upload time (`reportPersistence.ts`) and persisted as
`Alert` rows.

- **`negativeMarkers.ts`** — active defaults, unsatisfied CCJs, total
  outstanding negative balance, per-account utilisation (flagged
  ≥50%), and a 12-month search-volume count (flagged ≥20 — quotation
  searches don't directly affect a score, but a high volume reads as
  active credit-seeking to a manual underwriter).
- **`anomalyDetection.ts`**:
  - **DOB/name mismatch** — compares the applicant's own details
    (from "Application Details") against the name/DOB recorded on
    *each individual account and event block*. Name comparison is
    token-set-based (`{"TAYO","OLAOYE"}` vs `{"OLAOYE","TAYO"}` is a
    match — word order doesn't matter) so it only flags genuinely
    different names, not reordering.
  - **Mixed-file risk** — a composite flag: fires only when a DOB
    mismatch *and* a name mismatch are both present, since either
    alone is more likely a simple furnisher typo, while both stacking
    together is a stronger signal that another person's record has
    been merged in.
  - **Duplicate accounts** — flags account pairs sharing lender
    (normalized), type, open date, and balance — the common pattern
    when a debt is sold and both the original creditor and the
    purchaser still show a version of it.
- **`riskSummary.ts`** — rolls all of the above into a `riskLevel`
  (`LOW`/`MEDIUM`/`HIGH`/`SEVERE`, from alert severity counts), a
  plain-English `summary` paragraph, and a ranked `suggestedActions`
  list (CCJ first, then largest default, then utilisation, then
  identity disputes, then "ease off new applications" if search volume
  is high).
- **`disputeTextGenerator.ts`** — picks one of six letter templates
  (`auto`, `identity`, `ccj`, `default_validation`, `general_accuracy`,
  `notice_of_correction`) and builds its body dynamically from whatever
  alerts/CCJs/defaults actually apply, rather than a fixed template
  with blanks. The `[Your name]` / `[Your address]` placeholders are
  filled in from the caller's saved profile (`GET/PATCH /api/profile`)
  when set, and left as bracketed placeholders otherwise — never
  fabricated; the same is true of `notice_of_correction`'s statement,
  which the Act requires the user to draw up themselves — see
  [§ Statutory dispute tools](#statutory-dispute-tools). Each template
  function returns a structured `{ recipientLines, bodyLines }`
  rather than one flattened string, so `generateDisputeText()` (plain
  text) and `buildDisputeLetterParts()` (used by the envelope-ready PDF
  renderer, which needs the recipient address on its own to position it
  precisely) can share the same generation logic without drifting.

## Extending this

- **Add OAuth**: see the comment at the bottom of `auth.controller.ts`.
- **Add a real Equifax/TransUnion parser**: see § Parsing engine above.
- **Extend the test suite**: `experianParser.test.ts` covers the
  Experian block parser; the analytics engine (`riskSummary.ts`,
  `anomalyDetection.ts`, `negativeMarkers.ts`) and the CSV/generic
  parsers are still untested — same fixture-based approach, synthetic
  data only.
- **Generate real Prisma migrations**: see the note in § Status and
  scope — this repo was built in a network-restricted sandbox that
  couldn't reach `binaries.prisma.sh`, so the schema is synced with
  `prisma db push` on every boot rather than versioned migration files.
  Run `npx prisma migrate dev` yourself once you have normal internet
  access to lock in a real migration history (and swap `db push` back
  out of `backend/package.json`'s `start` script for `prisma migrate
  deploy` once you do).
