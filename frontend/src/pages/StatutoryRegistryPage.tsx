import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { ContactsResponse } from "../api/types";
import { AppShell } from "../components/AppShell";
import { ContactsPanel } from "../components/ContactsPanel";

/**
 * A dedicated, standalone directory page for the same contact data
 * ContactsPanel already renders inline on a report's page — this just
 * gives it its own route and framing, without a report to highlight
 * against (reportBureau is left as a value that matches nothing, so no
 * card gets the "This report's bureau" badge here).
 */
export function StatutoryRegistryPage() {
  const [contacts, setContacts] = useState<ContactsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getContacts()
      .then(setContacts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the statutory contacts registry."));
  }, []);

  return (
    <AppShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Statutory contacts registry</h1>
        <p className="mt-1 text-sm text-slate-400">
          Postal addresses for the three credit reference agencies, the court centre handling County Court Judgments, the Information
          Commissioner's Office and the Financial Ombudsman Service.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-critical">{error}</p>}
      {!contacts && !error && <p className="mt-4 text-sm text-slate-400">Loading…</p>}

      {contacts && (
        <div className="mt-6">
          <ContactsPanel contacts={contacts} reportBureau="UNKNOWN" />
        </div>
      )}
    </AppShell>
  );
}
