# Credit Report Analyzer — UK Credit Report Auditor & Statutory Dispute Engine

A full-stack app for uploading a UK credit report (PDF or CSV — Experian,
Equifax, or TransUnion) and getting back a structured breakdown of every
account, an automatic negative-marker and identity-anomaly scan (including
mixed-file/cross-contamination signals like DOB or name mismatches between
accounts), a plain-English risk summary, an illustrative per-bureau score
estimate, and ready-to-send statutory dispute text and PDFs. A guided
5-step workflow (`/remediate/1`–`/remediate/5`) walks a user from upload
through forensic audit, tri-bureau reconciliation, statutory dispute
generation, and a self-serve enhancement-suite of credit-rebuilding tools
— each step reusing the same underlying pages/endpoints described below
rather than duplicating them.

This README covers the project structure, the key backend routes and
data model, the key frontend components, and — in the most detail —
how the parsing and analytics engines actually work, since that's the
part worth understanding before you extend it. [§ Guided workflow &
feature map](#guided-workflow--feature-map) is the place to start if
you're trying to match a feature request against what's actually built.

## Status and scope

This is a working scaffold, not a hardened production system. Specifically:

- **The Experian parser is real and tested.** It was built against, and
  validated line-by-line against, an actual Experian UK consumer
  report — see [§ Parsing engine](#parsing-engine) for exactly what
  that testing found (including a real data-quality bug in how
  Experian itself represents "satisfied" defaults, which the parser
  now works around).
- **The Equifax parser is real and tested too**, built and checked
  against a real 109-page Equifax UK consumer report the same way the
  Experian parser was — see [§ Parsing engine](#parsing-engine) for
  what it covers (accounts across every agreement type, defaults,
  arrears, hard/soft searches, payment-history expansion) and what it
  deliberately doesn't yet (electoral register, gone-away records,
  CIFAS, property valuation — none of these feed the app's core
  features, and none were validated against a real sample containing
  them). Its one fully-honest gap is court judgments (CCJs): the real
  sample had none on it, so Equifax's actual judgment-table layout has
  never been seen. The parser now recognises an inferred Label/Value
  table for this section (keyed off Equifax's own documented CCJ/
  Administration Order/Bankruptcy/IVA category names) rather than only
  a keyword scan, but that inferred structure is itself unconfirmed —
  it still surfaces a warning even when it parses cleanly, and anything
  that doesn't match falls all the way back to the same conservative
  keyword scan the generic parser uses.
- **The TransUnion parser is real and tested too**, built and checked
  against a real 189-page TransUnion UK "My Credit Report" export the
  same way the Experian and Equifax parsers were — see
  [§ Parsing engine](#parsing-engine) for what it covers (accounts
  across all four category subsections, Judgments/CCJs, Searches,
  Address Link history, Personal Information) and what it deliberately
  doesn't (the monthly Status/Balance/Limit/Statement/Payment history
  grids — TransUnion's export glues adjacent months' figures together
  with no separator, so reconstructing them would mean guessing digit
  boundaries; a per-account header line's own balance figure, which is
  glued to its update date the same way; and a hard/soft distinction
  for searches, which this report simply doesn't make).
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
  `src/services/parsing/equifaxParser.test.ts` covers the same ground
  for the glued (colon-free) "LabelValue" table rows Equifax uses,
  every agreement type's block header, the plain-English Status
  classification (including "Inactive" and "N payments in arrears"),
  payment-history grid expansion and its top/bottom-row alignment
  logic, hard/soft search parsing, and both the inferred structured
  court-record table and its fallback to the keyword scan;
  `src/services/analytics/disputeTextGenerator.test.ts` covers the
  formal notice-of-correction letter (correct statutory citations, ICO
  not FOS, never "legally binding", the statement quoted verbatim
  rather than paraphrased, the 200-word-limit warning) and the
  electoral-roll supporting line (added only when explicitly true, and
  only to identity-type letters); `src/services/analytics/identityCheck.test.ts`
  covers the profile-vs-report comparison (unconfirmed profile, name
  match tolerant of word order, name/DOB mismatches, and the
  nothing-to-compare case); `src/services/analytics/documentPins.test.ts`
  covers the document-inspector anchor matching (word-boundary vs
  plain-substring matching, the lender-name fallback, and the
  not-located case returning null rather than a guess);
  `src/services/analytics/reconciliation.test.ts` covers the tri-bureau
  matrix (not-eligible states, lender+type matching across bureaus by
  ID rather than bureau reference, missing/status/balance discrepancy
  detection, and the balance-tolerance threshold);
  `src/services/parsing/transunionParser.test.ts` covers account block
  splitting across all four category subsections (including a real
  page-break artefact where a category heading lands mid-block),
  inline-vs-preceding-line organisation name derivation, status
  classification for all four status words, default/satisfied balance
  and date handling, the structured Judgments parse and its fallback
  to a keyword scan for unrecognised row layouts, Search parsing for
  both known and unrecognised purpose phrases, and the no-accounts-found
  warning path. The analytics engine's internal anomaly detection and
  the generic fallback parser still don't have coverage — this is a
  starting point, not a finished suite.
- **All three phases of the auditor/dispute-engine work are in place** —
  see [§ Statutory dispute tools](#statutory-dispute-tools) for the
  notice-of-correction template, envelope-ready PDF export, and
  postage-record/milestone tracker; [§ Confirmed identity vs. report
  data](#confirmed-identity-vs-report-data) for the self-declared
  profile identity that feeds the anomaly checks and letters, and the
  sample-vs-real report badge; [§ Regulatory toolkit & escalation
  hub](#regulatory-toolkit--escalation-hub) for the document inspector,
  tri-bureau reconciliation, and the bundled ICO/FOS escalation pack.
- **Prisma's engine binaries need internet access to install.**
  `npx prisma generate` downloads a query-engine binary on first run.
  If you're behind a restrictive proxy/firewall, allow
  `binaries.prisma.sh` or see Prisma's docs for offline/custom-engine
  options. Because of this, the schema is still synced with
  `prisma db push` on every boot (see `backend/package.json`'s `start`
  script) rather than through committed migration files — run
  `npx prisma migrate dev` yourself once you have unrestricted network
  access, to get real migration files under version control.

## Guided workflow & feature map

A persistent stepper (`frontend/src/components/RemediationStepper.tsx`,
hosted at `/remediate/:step`) walks a user through 5 stages, each one
reusing an existing page/endpoint rather than duplicating its logic:

1. **Ingest & Connect** (`/remediate/1`) — upload a PDF/CSV via the shared
   `ReportUploadForm`, or open one of the three seeded sample reports
   (mixed-file case study, clean prime profile, adverse defaults profile
   — see `backend/prisma/seed.ts`) from the dashboard.
2. **Forensic Quality Audit** (`/remediate/2`) — links to the uploaded
   report's own detail page, which surfaces the anomaly/mixed-file alerts
   (`services/analytics/anomalyDetection.ts`) and an illustrative
   per-bureau score estimate on that report's own bureau scale (Experian
   /999, Equifax /1000, TransUnion /710 — see
   `services/analytics/creditScoreEstimate.ts`; **this is this app's own
   transparent estimate, never a real bureau score** — see that file's
   doc comment for exactly why one can't be reproduced).
3. **Multi-Bureau Reconciliation** (`/remediate/3`) — links to
   `/reconciliation`, which now also computes a debt-to-credit-limit ratio
   per cell where both figures are known, and offers a CSV export
   (`GET /api/reconciliation/export.csv`) and a print-friendly view for
   handing a summary to a broker or adviser.
4. **Statutory Legal Action** (`/remediate/4`) — links to the report's
   dispute-generation tools (see [§ Statutory dispute
   tools](#statutory-dispute-tools) below) and the [statutory contact
   registry](#regulatory-toolkit--escalation-hub) at `/registry`.
5. **Enhancement Suite** (`/remediate/5`) — links to `/enhancement-suite`,
   7 self-contained client-side tools: a Notice of Correction word-count
   scratchpad, a credit-utilisation simulator, a mortgage-readiness
   checklist, a search-impact (12-month drop-off) countdown, a CCJ/default
   cost-of-waiting estimator, a dispute-lifecycle checklist, and a
   next-best-action summary pulled from the report's own already-computed
   `suggestedActions`. Every calculator on this page is explicitly labelled
   as illustrative/educational, never financial or legal advice.

Two more standalone pages: `/registry` (a dedicated directory view of the
existing bureau/court/ICO/FOS contact data — see
[§ Regulatory toolkit](#regulatory-toolkit--escalation-hub)) and
`/api-docs` (an accurate, auto-derived-from-the-routes reference of the
real REST API surface, including an honest architecture note — this app's
report/account/alert data **is** persisted server-side in PostgreSQL via
Prisma; nothing about this app runs "client-side only" or avoids the
server, and no page claims otherwise).

**A deliberately fake "Equifax gateway" simulation** lives at
`/equifax-gateway` and `POST /api/simulation/equifax/*` — a 3-step
identity-verification → OAuth2-token → credit-file wizard illustrating
what connecting to a live bureau API might look like. This app has **no
real integration with Equifax or any credit reference agency**. Every
response from every endpoint under `/api/simulation` carries
`simulated: true` and a `disclaimer` field by design (see
`backend/src/controllers/simulation.controller.ts`'s top-of-file comment
for the two rules future changes must not relax), and the frontend page
renders a persistent, sticky "SIMULATED DEMO" banner on every step rather
than a buried footnote. This exists because a screen that convincingly
imitates a real, regulated financial institution's identity-verification
flow — with no indication it's fake — would be a look-alike of that
institution's real product, which this app won't ship undisclosed even as
an internal demo.

**One thing this app deliberately does NOT do**, even though it was
asked for: reproduce an official Post Office/Royal Mail proof-of-posting
certificate (stamp box, barcode graphic, "Post Office®" styling) for the
postage-record PDF. `services/pdf/trackingSheetPdf.ts` now records which
real Royal Mail service was used (a fixed picklist — Special Delivery
Guaranteed / Signed For 1st Class / Standard 1st Class / Other — see
`POSTAL_SERVICES`) and puts the statutory milestone tracker on its own
second page, but it stays an honest, unbranded "your own notes" sheet,
never a fabricated replica of a real organisation's official document —
see that file's doc comment.

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
  an optional user-entered `contactAddress`. This global dedup is also
  what tri-bureau reconciliation keys on — the same real-world creditor
  lands on the same `Lender` row regardless of which bureau's report it
  came from, even though each bureau assigns its own independent
  account reference (see § Regulatory toolkit & escalation hub).
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
| `GET /api/reports/:id/inspector` | The document inspector's data: the report's raw extracted text plus a "pin" per alert anchoring it to where its evidence appears in that text — see § Regulatory toolkit & escalation hub |
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
| `GET /api/disputes/:id/escalation-pack-pdf` | A bundled PDF (case summary, the letter as sent, escalation authority contact + dated milestones) for one logged dispute — 400s for a CCJ dispute, which has no ICO/FOS escalation route — see § Regulatory toolkit & escalation hub |
| `GET /api/reconciliation` | Cross-references the user's most recent real (non-sample) report from each bureau to flag accounts reported inconsistently between them — see § Regulatory toolkit & escalation hub |

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
  download button, an "Escalation pack" download button (for every
  template except CCJ, which has no ICO/FOS route), an ICO escalation
  note once a statutory deadline has passed, plus buttons to mark a
  dispute resolved or unanswered.
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
copy-to-clipboard/PDF export and sent-dispute tracking, alerts (with a
link through to the document inspector), accounts, and a delete button
so a report can be removed and re-uploaded), `ReportInspectorPage`
(the document inspector — see § Regulatory toolkit & escalation hub),
`AccountDetailPage` (single account, an editable lender/agent contact
address, balance chart, and timeline), `ReconciliationPage` (the
tri-bureau reconciliation matrix — see § Regulatory toolkit &
escalation hub, linked from the header nav), `SettingsPage`
(self-declared name/date of birth/address for letter auto-fill and the
profile-vs-report check, an electoral-roll registration note, and a
confirmed/not-confirmed identity banner — all explicitly labelled as
self-declared, never independently verified), `ForgotPasswordPage` /
`ResetPasswordPage`. Auth state lives in `AuthContext` and the JWT
sits in `localStorage`.

## Statutory dispute tools

Phase 1 of the "statutory dispute engine" work. Everything here is
addressed to the credit reference agency (or, where noted, is neutral
paperwork). See § Confirmed identity vs. report data for Phase 2 and
§ Regulatory toolkit & escalation hub for Phase 3.

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

## Regulatory toolkit & escalation hub

Phase 3 of the auditor/dispute-engine work: a document inspector for
tracing a finding back to the source text, cross-bureau reconciliation,
and a bundled escalation pack for when a statutory deadline is missed.
None of this needed a schema change — it's all built from data the app
already persists.

- **Document inspector** (`GET /api/reports/:id/inspector`,
  `services/analytics/documentPins.ts`, `ReportInspectorPage`). Shows
  the report's raw extracted text with each alert "pinned" to where its
  evidence actually appears — anchored first to the related account's
  bureau reference (e.g. "C11"), falling back to the lender's name if
  the reference itself isn't findable in the text. **This is not a
  rendered image of the original PDF's page layout** — the app only
  ever kept the text `pdf-parse` extracted at upload time, never the
  original file bytes, so a "pin" is a character range inside that
  extracted text, not a page/x/y coordinate. Matching is word-boundary
  first (so a short ref like "C1" can't match inside "C11") with a
  plain-substring fallback, and — deliberately — an alert whose anchor
  can't be found anywhere in the text is shown as "not located" rather
  than given a guessed position; see `documentPins.test.ts` for the
  boundary-matching and not-located cases specifically.
- **Tri-bureau reconciliation** (`GET /api/reconciliation`,
  `services/analytics/reconciliation.ts`, `ReconciliationPage`, linked
  from the header nav). Takes the user's most recently uploaded *real*
  report (`isSample: false`) from each bureau and cross-references
  them account by account, matched by `(lenderId, accountType)` rather
  than by bureau reference — bureau refs are assigned independently by
  each bureau and never line up, but `Lender` rows are already
  deduplicated globally by normalized name (see § Data model), so the
  same real-world creditor lands on the same row no matter which
  bureau's report it came from. Flags three kinds of discrepancy: an
  account present on one bureau's file but absent from another's
  (captioned to note this could mean not-yet-furnished, already
  removed, or genuinely missing — the app can't tell which), a status
  that differs between bureaus, and a balance that differs by more than
  whichever is larger of £50 or 5% (a fixed pound threshold alone would
  flag noise on large balances; a percentage alone would flag noise on
  small ones — see `balancesMateriallyDiffer` and
  `reconciliation.test.ts`). Needs real reports from at least two
  different bureaus to produce anything; with fewer, it explains why
  rather than showing an empty table.
- **ICO/FOS escalation pack** (`GET
  /api/disputes/:id/escalation-pack-pdf`,
  `services/pdf/escalationPackPdf.ts`, a button on `DisputeTracker`). A
  single bundled PDF for a logged dispute: a cover page (case summary,
  every alert the analytics engine actually flagged on that report, the
  live identity-check result if it's a mismatch, the itemised
  CCJ/default schedule, and any notes logged against the dispute), the
  original letter reproduced in plain layout for the record, and a
  final page with the correct escalation authority's contact details
  and the dispute's dated milestones (reusing the same milestone logic
  as the tracking sheet, so the two can never disagree). **Which
  authority depends on the template**, reusing the ICO-vs-FOS
  distinction from § Statutory dispute tools rather than picking one
  arbitrarily: the CRA-statutory templates (identity/general
  accuracy/auto/notice of correction) escalate to the ICO under s.159;
  `default_validation` is addressed to a lender, so an unanswered
  letter is a conduct complaint and escalates to the FOS instead; a
  `ccj` dispute is addressed to a court, has no ICO/FOS route at all,
  and the endpoint returns a 400 explaining that rather than pointing
  to the wrong regulator (`DisputeTracker` only shows the button for
  templates that actually have a route). Explicitly labelled
  informational on its own cover page — it's meant to be attached to,
  or read alongside, whatever the user actually sends the regulator,
  not submitted in its place.

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
C12MR JORDAN SMITH, 12, SAMPLE STREET, LEEDS, LS1 4ABDate of Birth:14/03/1988
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

### Equifax (`equifaxParser.ts`)

Built and validated against a real 109-page Equifax UK consumer
report, the same way as the Experian parser. Equifax's layout is a
numbered-section report (1. Personal Information … 10. CIFAS) where
every credit agreement is its own bordered "Label | Value" table, one
row per field, followed by a separate month-by-month payment-history
grid. The key structural fact that drives the whole parser: pdf-parse
extracts each table row as `LabelValue` glued together with **no**
separator — no colon, unlike Experian (e.g. `Account NumberXXXXXXX7863`,
`Current Balance£0`, `Default DateN/A`) — so label/value extraction
anchors on the literal label text itself (`extractLabels()`), and
block splitting anchors on the closed set of account-type header
prefixes Equifax actually uses (`Credit Card|Loan|Communications
Supplier|Basic Bank Account|Current Account|Mail Order|Hire
Purchase|Agreement`) rather than a generic "capitalised words + from"
pattern, which would false-positive on ordinary prose.

What it covers:

- **Every agreement type** — credit cards, loans, hire purchase,
  utilities/communications suppliers, banking/current accounts, mail
  order — both open and closed, since they all share the same table
  shape.
- **Status classification from Equifax's own plain-English `Status`
  field** ("Up to date with payments", "Settled", "Default", "N
  payments in arrears", "Inactive"), corroborated by Default Date /
  Date Satisfied the same way Experian's `classifyAccountStatus()`
  corroborates its balance-field label — see `classifyEquifaxStatus()`.
  An "in arrears" status also raises a dedicated `ARREARS` event.
- **The payment-history grid** (`JFMAMJJASOND` + one row per year,
  each row a single glued token of year+status-codes). A full row is
  always exactly 12 codes; a short row only ever occurs at the very
  top (the current/report year, not yet finished) or the very bottom
  (the oldest year shown, truncated by Equifax's retention window) —
  confirmed against the real sample's own start dates — so those two
  positions are aligned to January and December respectively, and any
  other short row is skipped rather than guessed at. See
  `extractPaymentHistory()`.
- **Hard and soft searches** (section 7), including rows where the
  consumer's own DOB prints as `N/A` instead of a date.
- **Court records (section 5), with an inferred-but-unconfirmed
  structured path.** The real sample this was built from has no CCJs
  on it (all three "Public Records at …" subsections read "No data
  present"), so Equifax's actual judgment-table layout has never been
  seen. The parser trusts the "no data" case with full confidence. For
  a non-empty section, it first looks for the same bordered Label/Value
  table shape used by every other block on this report, keyed off the
  category headings Equifax documents for this section (County Court
  Judgment, Administration Order, Bankruptcy, Individual Voluntary
  Arrangement, and their Scottish equivalents Decree/Trust Deed) —
  see `parseCourtRecordBlock()`. That table has never actually been
  seen on a real report either, so even a clean structured parse still
  attaches a warning saying so; anything that doesn't match this shape
  at all falls back further, to the same keyword scan
  `genericFallbackParser.ts` uses, with its own warning.

What it deliberately doesn't parse yet: electoral register (section
3), gone-away records (section 9), and CIFAS (section 10) — none of
these feed the app's core features (CCJ detection, active-default
detection, search-volume alerts, account status history), and building
dedicated parsing for them without a real sample containing data would
mean guessing. The applicant's own date of birth is also inferred
best-effort (the first account block that recorded one — Equifax's
Personal Information section only prints the applicant's *addresses*,
not their DOB, unlike Experian's Application Details block).

### TransUnion (`transunionParser.ts`)

Built and cross-checked against the real `pdf-parse` text extracted
from a real 189-page TransUnion "My Credit Report" export, the same
rigor as the Experian and Equifax parsers. TransUnion's layout is a
long-form report (Personal Information, Financial Account Information
split into Credit cards / Personal loans and mortgages / Other
accounts / Closed accounts, Searches, Address Links, Public
Information) that shares Equifax's glued-label problem — every field
is `LabelValue` with no separator (`Account numberXXXXXXXXXXXXXXXX3139`,
`Opening balance£1,309`) — plus one problem Equifax's real sample
didn't have: each account's own summary row glues its organisation
name, balance, update date and status together with no separator
either (`Newday LTD (Aqua)£25131 Aug 2026Up to date`), and the monthly
Status/Balance/Limit/Statement/Payment history grids glue every
month's figures into one digit string with no column width to split
on (e.g. nine months' balances as `659609559509459…`).

What it covers:

- **Personal Information** — name, date of birth (its own
  "Month D, YYYY" format, distinct from the `DD/MM/YYYY` used
  everywhere else on the report) and current address.
- **Accounts across all four category subsections**, parsed as one
  continuous stream rather than four separate section parsers — a
  category heading (e.g. "Other accounts") can land in the middle of
  an account's own block due to a PDF page break, so block-splitting
  doesn't track "current category" state at all; it isn't needed,
  since account classification doesn't depend on category. Each
  account's organisation name is read from an inline prefix on its
  summary row when present, otherwise derived from the 1–2 lines
  immediately before it (filtering out section headings, table
  headers, and long descriptive prose a rolling window can pick up).
  Only the account's own labelled fields — opening balance, default
  balance, opened/default/end dates, account number, linked address,
  recorded name/DOB — are extracted with confidence; the summary
  row's own balance and update-date figures are deliberately **not**
  extracted, because they're glued together with no reliable way to
  tell where one figure ends and the other begins (see the file
  comment in `transunionParser.ts` for a worked example of why a
  regex-based split there would risk being silently wrong).
- **Judgments** (Public Information section) — a clean, reliably
  structured table for County Court Judgments (case reference, court
  name, judgment date, amount, notice-of-dispute flag,
  active/satisfied status and satisfaction date). The other categories
  TransUnion's own section intro names (Decree, Administration Order,
  Bankruptcy, Individual Voluntary Arrangement, Trust Deed) are
  included in the row-matching pattern on the strength of that intro
  text alone — none were seen populated on the real sample — and a row
  that doesn't match any known type layout falls back to the same
  conservative keyword-scan-with-warning approach Equifax's
  court-records section uses.
- **Searches** — read via a state machine keyed on the report's own
  `Input address` / `Application type(Sole|Joint)` anchors, against a
  closed set of purpose phrases actually seen on the real sample
  ("Consumer Credit File Request", "Credit Application", "Identity
  Check for Credit", "Insurance Quotation", "Quotation Search"). A row
  using a purpose phrase outside that set still gets a best-effort
  date extraction rather than being dropped. Unlike Equifax and
  Experian, TransUnion's own report makes no hard/soft distinction for
  searches, so `ParsedEvent.detail` doesn't fabricate one.
- **Address link history** — a clean, deduplicated numbered list, read
  in preference to reconstructing addresses from the individual
  From/To/Source link records (which repeat the same addresses many
  times over).

What it deliberately doesn't parse: the monthly Status/Balance/Limit/
Statement/Payment history grids (every account's `statusHistory` is
always empty, with a one-time warning explaining why — see the file
comment), and a summary row's own balance/update-date figures (see
above). Neither is guessed at, in line with every other parser in this
codebase.

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
    token-set-based (`{"SMITH","JORDAN"}` vs `{"JORDAN","SMITH"}` is a
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
- **Confirm Equifax and TransUnion's court-judgment table shapes
  against a real populated sample**: both parsers' structured
  Label/Value CCJ tables (`parseCourtRecordsSection()` in
  `equifaxParser.ts`, `parseJudgmentsSection()` in
  `transunionParser.ts`) were written from each bureau's own
  documented category names rather than a real sample containing a
  judgment, so both still carry a warning even on a clean parse — get
  a sample report with a real CCJ on it and drop the warning once the
  shape is confirmed (or fix it, if it turns out to differ).
- **Add real TransUnion monthly payment-history parsing**: the
  Status/Balance/Limit/Statement/Payment grids glue every month's
  figures into one digit string with no separator or reliable column
  width (see § Parsing engine), so `transunionParser.ts` doesn't
  attempt it. If a future export turns out to have a splittable
  layout (a monospaced/positional PDF extraction instead of
  `pdf-parse`'s plain text, for instance), extend it the way
  `equifaxParser.ts`'s `extractPaymentHistory()` handles Equifax's own
  (unglued) grid.
- **Extend the test suite**: `experianParser.test.ts`,
  `equifaxParser.test.ts` and `transunionParser.test.ts` cover those
  three block parsers; the analytics engine (`riskSummary.ts`,
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
- **Add direct email dispatch of dispute letters**: the dispute flow
  generates letter text/PDFs and lets the user download and send them
  themselves, but there's no "send this letter by email" button that
  actually dispatches it from the app (nodemailer is already a
  dependency, used today only for the password-reset flow — see
  `auth.controller.ts` — so wiring a real send would reuse that same
  transport). Deliberately not built without the user seeing this
  called out first, since auto-sending a legal notice on someone's
  behalf is a bigger trust step than generating one for them to review.
- **Add one-click "dispute this" links from the reconciliation table**:
  `/reconciliation` flags which accounts differ by bureau but doesn't
  yet deep-link a flagged row straight into that account's report page
  with a dispute template pre-selected — worth adding once there's a
  reliable way to map a reconciliation row's `accountId` (per bureau) to
  the right report + template combination.
- **`ComparisonPanel.tsx` vs. the reconciliation table**: these are two
  different comparisons — `ComparisonPanel` shows one report's own stats
  over time (this upload vs. your previous one), while the new
  debt-to-limit/CSV-export/print work landed on `/reconciliation`'s
  cross-bureau table instead, since that's what actually has per-bureau
  `ReconciliationCell`s to compute a ratio from. Don't conflate the two
  when extending either.
