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
- **Auth is email+password only.** JWT-based, with bcrypt hashing.
  OAuth isn't wired up — `auth.controller.ts` has a comment on the
  cleanest way to add it (Passport.js).
- **No test suite.** The parser and analytics engine were validated by
  running them against real and synthetic fixtures during development
  (see `prisma/seed.ts` for a synthetic end-to-end example), but
  there's no automated regression suite yet. Add one before this goes
  near production, especially around the Experian block parser, which
  is the most regex-heavy code in the repo.
- **Prisma's engine binaries need internet access to install.**
  `npx prisma generate` downloads a query-engine binary on first run.
  If you're behind a restrictive proxy/firewall, allow
  `binaries.prisma.sh` or see Prisma's docs for offline/custom-engine
  options.

## Project structure

```
credit-report-analyzer/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # data model — see § Data model
│   │   └── seed.ts                # synthetic demo user + report
│   ├── src/
│   │   ├── config/                # env loading, Prisma client instance
│   │   ├── middleware/             # auth (JWT), upload (multer), error handler
│   │   ├── routes/                 # auth.routes, reports.routes, accounts.routes
│   │   ├── controllers/            # request handlers — thin, delegate to services
│   │   ├── services/
│   │   │   ├── parsing/            # § Parsing engine — the core of this app
│   │   │   ├── analytics/          # § Analytics engine
│   │   │   └── reportPersistence.ts # ParsedReport -> Prisma rows, in one transaction
│   │   ├── utils/                  # jwt, pdf text extraction, csv reading
│   │   └── index.ts                # Express app bootstrap
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/                    # fetch client + response types
│   │   ├── context/AuthContext.tsx # login/register/logout, token in localStorage
│   │   ├── components/             # StatCard, RiskBadge, AlertList, AccountTable, AccountTimeline, AppShell
│   │   ├── pages/                  # Login, Signup, Dashboard, ReportDetail, AccountDetail
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

Five tables, defined in `backend/prisma/schema.prisma`:

- **User** — email + bcrypt password hash.
- **Report** — one row per upload. Holds the bureau, the applicant's
  name/DOB/addresses *as read off the report itself* (not the user's
  account details — these can and do differ, which is exactly what
  the DOB-mismatch check looks for), and the raw extracted text (kept
  so re-analysis never needs a re-upload).
- **Lender** — deduplicated by a normalized name
  (`normalizeLenderName()` strips "LTD"/"PLC"/etc and punctuation), so
  "JC International Acquisition LLC" appearing on three different
  accounts collapses to one Lender row instead of three.
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

## Key backend routes

All routes under `/api/reports` and `/api/accounts` require
`Authorization: Bearer <token>` (`middleware/auth.ts`).

| Method & path | What it does |
|---|---|
| `POST /api/auth/register` | Create an account, returns a JWT |
| `POST /api/auth/login` | Returns a JWT |
| `POST /api/reports` | Multipart upload (`file` field, PDF or CSV) → extract text → parse → persist → returns `{ reportId, riskSummary }` |
| `GET /api/reports` | List the caller's reports with account/alert counts |
| `GET /api/reports/:id` | Full report detail: stats, accounts, events, alerts (each with `relatedAccountIds`), plus `insights` (risk level, plain-English summary, suggested actions) and `negativeMarkers` (CCJ/default/utilisation/search counts and totals) |
| `GET /api/reports/:id/dispute-templates` | Lists the dispute letter templates available for this report (`auto`, `identity`, `ccj`, `default_validation`, `general_accuracy`), each flagged `relevant: true/false` based on what was actually found on the report |
| `GET /api/reports/:id/dispute-text?template=<id>` | Plain-text dispute letter body for the chosen template (defaults to `auto`, which picks the most relevant one), built from the report's already-persisted alerts/events/accounts |
| `DELETE /api/reports/:id` | Delete a report (cascades to its accounts/events/alerts) — lets a user re-upload a corrected or newer file |
| `GET /api/accounts/:id` | One account's detail (including `lenderContactAddress`) plus its merged timeline (monthly history + dated events) |
| `PATCH /api/accounts/:id/lender-contact` | Set or clear the postal address for that account's lender (shared across every account for the same lender) |
| `GET /api/contacts` | Verified UK postal addresses/contact details for Experian, Equifax, TransUnion, and the CCJ court centre (Civil National Business Centre) |

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

Pages: `DashboardPage` (list + upload, with a "how it works" walkthrough
for new users), `ReportDetailPage` (risk summary and suggested actions,
charts, negative-markers table, alerts, accounts, a dispute-template
picker with copy-to-clipboard export, useful contacts, and a delete
button so a report can be removed and re-uploaded), `AccountDetailPage`
(single account, an editable lender/agent contact address, balance
chart, and timeline). Auth state lives in `AuthContext` and the JWT sits
in `localStorage`.

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
- **`disputeTextGenerator.ts`** — builds the dispute letter body
  dynamically from whatever alerts actually fired (a DOB-mismatch
  paragraph only appears if one was found, etc), rather than a fixed
  template with blanks. The contact-detail placeholders (`[Your
  name]`, `[Your address]`) are deliberately left for the user to
  fill in rather than fabricated.

## Extending this

- **Add OAuth**: see the comment at the bottom of `auth.controller.ts`.
- **Add a real Equifax/TransUnion parser**: see § Parsing engine above.
- **Add tests**: `experianParser.ts` is the highest-value target —
  it was validated manually during development by running it against
  a real report and checking every extracted field against the source
  PDF; turning that into a fixture-based test (using a synthetic
  fixture like the one in `prisma/seed.ts`, never real personal data)
  would lock that in.
- **Rate-limit uploads and auth routes** before deploying publicly —
  neither is currently limited.
