import { AppShell } from "../components/AppShell";

interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth: boolean;
}

interface Group {
  prefix: string;
  title: string;
  endpoints: Endpoint[];
}

// Kept in sync by hand with backend/src/index.ts (router mount points) and
// backend/src/routes/*.ts (methods + paths) — this documents the actual,
// currently-mounted API surface, not an aspirational one. "Auth" means the
// route sits behind requireAuth (a valid JWT bearer token is required).
const GROUPS: Group[] = [
  {
    prefix: "/api/auth",
    title: "Auth",
    endpoints: [
      { method: "POST", path: "/register", description: "Create an account and return a JWT.", auth: false },
      { method: "POST", path: "/login", description: "Authenticate with email + password and return a JWT.", auth: false },
      { method: "POST", path: "/forgot-password", description: "Request a password-reset email.", auth: false },
      { method: "POST", path: "/reset-password", description: "Set a new password using a reset token.", auth: false },
    ],
  },
  {
    prefix: "/api/reports",
    title: "Reports",
    endpoints: [
      { method: "POST", path: "/", description: "Upload a report file (PDF or CSV), parse it and persist it.", auth: true },
      { method: "GET", path: "/", description: "List the current user's uploaded reports.", auth: true },
      { method: "GET", path: "/:id", description: "Get a report's full detail: accounts, alerts, stats, insights, identity check.", auth: true },
      { method: "GET", path: "/:id/compare", description: "Compare this report's stats against the user's previous report.", auth: true },
      { method: "GET", path: "/:id/inspector", description: "Get the report's raw extracted text plus alert-to-text position pins.", auth: true },
      { method: "GET", path: "/:id/dispute-templates", description: "List which dispute letter templates apply to this report.", auth: true },
      { method: "GET", path: "/:id/dispute-text", description: "Generate a dispute letter's plain text for a chosen template.", auth: true },
      { method: "GET", path: "/:id/dispute-pdf", description: "Generate a dispute letter as a print-ready PDF.", auth: true },
      { method: "DELETE", path: "/:id", description: "Delete a report and its accounts/alerts.", auth: true },
    ],
  },
  {
    prefix: "/api/accounts",
    title: "Accounts",
    endpoints: [
      { method: "GET", path: "/:id", description: "Get one account's detail and status/event timeline.", auth: true },
      { method: "PATCH", path: "/:id/lender-contact", description: "Set the lender's postal address for dispute letters.", auth: true },
    ],
  },
  {
    prefix: "/api/contacts",
    title: "Contacts",
    endpoints: [
      { method: "GET", path: "/", description: "Get the maintained directory of bureau, court, ICO and FOS contact details.", auth: true },
    ],
  },
  {
    prefix: "/api/profile",
    title: "Profile",
    endpoints: [
      { method: "GET", path: "/", description: "Get the user's self-declared identity profile (name, DOB, address).", auth: true },
      { method: "PATCH", path: "/", description: "Update the user's self-declared identity profile.", auth: true },
    ],
  },
  {
    prefix: "/api/disputes",
    title: "Disputes",
    endpoints: [
      { method: "POST", path: "/", description: "Log a dispute letter as sent for a report.", auth: true },
      { method: "GET", path: "/", description: "List logged disputes, optionally filtered by reportId.", auth: true },
      { method: "PATCH", path: "/:id", description: "Update a dispute's status (resolved / no response) and notes.", auth: true },
      { method: "GET", path: "/:id/tracking-sheet-pdf", description: "Generate a plain postage-tracking record PDF for a dispute.", auth: true },
      { method: "GET", path: "/:id/escalation-pack-pdf", description: "Generate an ICO/FOS escalation pack PDF for an overdue statutory dispute.", auth: true },
    ],
  },
  {
    prefix: "/api/reconciliation",
    title: "Reconciliation",
    endpoints: [
      { method: "GET", path: "/", description: "Compare the same accounts across the user's most recent report per bureau.", auth: true },
      { method: "GET", path: "/export.csv", description: "Export the reconciliation comparison as a CSV file.", auth: true },
    ],
  },
  {
    prefix: "",
    title: "Health",
    endpoints: [{ method: "GET", path: "/health", description: "Liveness check — returns { ok: true }.", auth: false }],
  },
];

const METHOD_STYLE: Record<Endpoint["method"], string> = {
  GET: "bg-accent/15 text-accent",
  POST: "bg-good/15 text-good",
  PATCH: "bg-warn/15 text-warn",
  DELETE: "bg-critical/15 text-critical",
};

export function ApiDocsPage() {
  return (
    <AppShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-100">API reference</h1>
        <p className="mt-2 text-sm text-slate-300">
          This page documents this application's own backend REST API, for developers and other technical users integrating with it or
          working on it directly — it is not consumer-facing help content.
        </p>
        <p className="mt-3 text-sm text-slate-300">
          Architecture: the frontend is a React single-page app that talks to an Express + Prisma + PostgreSQL backend over JSON, all
          under the <code className="rounded bg-panel px-1 py-0.5 text-xs text-slate-200">/api</code> prefix shown below. Every route
          except registration, login and password reset requires a JWT bearer token, obtained from{" "}
          <code className="rounded bg-panel px-1 py-0.5 text-xs text-slate-200">/api/auth/login</code> and sent as{" "}
          <code className="rounded bg-panel px-1 py-0.5 text-xs text-slate-200">Authorization: Bearer &lt;token&gt;</code>. Report data,
          account records, alerts and dispute history are persisted server-side in Postgres — none of it is client-side-only or kept off
          a server.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {GROUPS.map((group) => (
          <section key={group.title} className="rounded-lg border border-border bg-panel p-5">
            <h2 className="text-sm font-semibold text-slate-100">
              {group.title}
              {group.prefix && <span className="ml-2 font-mono text-xs font-normal text-slate-500">{group.prefix}</span>}
            </h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-2">Method</th>
                    <th className="px-4 py-2">Path</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2">Auth</th>
                  </tr>
                </thead>
                <tbody>
                  {group.endpoints.map((e) => (
                    <tr key={`${e.method} ${e.path}`} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_STYLE[e.method]}`}>{e.method}</span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-200">
                        {group.prefix}
                        {e.path === "/" ? "" : e.path}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{e.description}</td>
                      <td className="px-4 py-2 text-xs text-slate-400">{e.auth ? "JWT required" : "Public"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Note: the codebase also defines an <code className="rounded bg-surface px-1 py-0.5">/api/simulation/equifax/*</code> router (a
        clearly-labelled demo simulation of a credit-check portal, not a real bureau integration) — it is not currently mounted in the
        running app's <code className="rounded bg-surface px-1 py-0.5">index.ts</code>, so it is left out of the table above as
        unreachable rather than documented as live.
      </p>
    </AppShell>
  );
}
