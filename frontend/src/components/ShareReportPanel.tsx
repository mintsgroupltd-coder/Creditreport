import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { CreateShareLinkResponse, ShareLinkRow } from "../api/types";

const EXPIRY_OPTIONS: { label: string; hours: number }[] = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

type LinkStatus = "active" | "expired" | "revoked";

function statusOf(link: ShareLinkRow): LinkStatus {
  if (link.revokedAt) return "revoked";
  if (new Date(link.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

function StatusPill({ status }: { status: LinkStatus }) {
  const styles: Record<LinkStatus, string> = {
    active: "bg-good/15 text-good",
    expired: "bg-slate-500/15 text-slate-400",
    revoked: "bg-critical/15 text-critical",
  };
  const labels: Record<LinkStatus, string> = { active: "Active", expired: "Expired", revoked: "Revoked" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}

/**
 * Self-contained "Share" button + panel for generating and managing
 * time-limited, revocable, read-only share links for a report. Anyone
 * with a created link can view a trimmed summary of the report — no
 * account needed — until it expires or is revoked here.
 */
export function ShareReportPanel({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(EXPIRY_OPTIONS[1].hours);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<CreateShareLinkResponse | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function refreshLinks() {
    setLoadingLinks(true);
    api
      .listShareLinks(reportId)
      .then((res) => setLinks(res.shareLinks))
      .catch(() => undefined)
      .finally(() => setLoadingLinks(false));
  }

  useEffect(() => {
    if (open) refreshLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const result = await api.createShareLink(reportId, expiresInHours);
      setCreatedLink(result);
      setCopyState("idle");
      refreshLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a share link.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // Clipboard API can be blocked — fall back to selecting the text
      // so the person can copy it manually.
      const input = document.getElementById("share-link-url") as HTMLInputElement | null;
      input?.select();
    }
  }

  async function handleRevoke(linkId: string) {
    setRevokingId(linkId);
    setError(null);
    try {
      const updated = await api.revokeShareLink(reportId, linkId);
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not revoke this share link.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-border px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent hover:text-accent"
      >
        Share
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-lg border border-border bg-panel p-4 shadow-xl">
          <h3 className="text-sm font-semibold text-slate-100">Share this report</h3>
          <p className="mt-1 text-xs text-slate-400">
            Anyone with a link below can view a read-only summary of this report — no account needed — until it expires or you revoke
            it. It excludes the raw document text, date of birth, and full postal addresses.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.hours} value={opt.hours}>
                  Expires in {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create link"}
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-critical">{error}</p>}

          {createdLink && (
            <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-3">
              <p className="text-xs text-slate-400">Link created — copy it now and share it however you like:</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="share-link-url"
                  readOnly
                  value={createdLink.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-slate-200"
                />
                <button
                  onClick={() => handleCopy(createdLink.url)}
                  className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-slate-200 hover:border-accent hover:text-accent"
                >
                  {copyState === "copied" ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Expires {new Date(createdLink.expiresAt).toLocaleString("en-GB")}</p>
            </div>
          )}

          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Previously created links</h4>
            {loadingLinks ? (
              <p className="mt-2 text-xs text-slate-500">Loading…</p>
            ) : links.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No share links created yet.</p>
            ) : (
              <ul className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
                {links.map((link) => {
                  const status = statusOf(link);
                  return (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusPill status={status} />
                          <span className="truncate text-xs text-slate-400">
                            {status === "revoked" && link.revokedAt
                              ? `Revoked ${new Date(link.revokedAt).toLocaleDateString("en-GB")}`
                              : `Expires ${new Date(link.expiresAt).toLocaleDateString("en-GB")}`}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {link.viewCount} view{link.viewCount === 1 ? "" : "s"}
                          {link.lastViewedAt && ` · last viewed ${new Date(link.lastViewedAt).toLocaleDateString("en-GB")}`}
                        </p>
                      </div>
                      {status === "active" && (
                        <button
                          onClick={() => handleRevoke(link.id)}
                          disabled={revokingId === link.id}
                          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-critical hover:text-critical disabled:opacity-50"
                        >
                          {revokingId === link.id ? "Revoking…" : "Revoke"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
