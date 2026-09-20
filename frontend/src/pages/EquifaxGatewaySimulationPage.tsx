import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { SimulatedCreditFileResponse, SimulatedVerifyIdentityResponse } from "../api/types";
import { AppShell } from "../components/AppShell";

type Step = "details" | "confirm" | "result";

const DEMO_FULL_NAME = "Alex Demo";
const DEMO_DOB = "1990-01-01";
const DEMO_ADDRESS = "12 Sample Street, Leeds, LS1 4AB";

/**
 * A persistent, unmissable banner reminding the viewer this whole page is
 * a simulation — see backend/src/controllers/simulation.controller.ts's
 * own doc comment for why this matters. Rendered at the top of every
 * step (not just step 1) and kept `sticky` so it can't be scrolled past.
 */
function SimulationBanner({ disclaimer }: { disclaimer?: string }) {
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-6 border-b-2 border-amber-600 bg-amber-400 px-6 py-3 text-amber-950 shadow-md sm:-mx-6">
      <p className="text-sm font-bold uppercase tracking-wide">Simulated demo</p>
      <p className="text-xs font-medium">
        {disclaimer ?? "This is not a real connection to Equifax or any credit reference agency. All data below is illustrative."}
      </p>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "1. Personal details" },
    { key: "confirm", label: "2. Identity & residence" },
    { key: "result", label: "3. Credit file request" },
  ];
  return (
    <div className="mb-6 flex flex-wrap gap-2 text-xs">
      {steps.map((s) => (
        <span
          key={s.key}
          className={`rounded-full px-3 py-1 font-medium ${
            s.key === step ? "bg-accent/20 text-accent" : "bg-panel text-slate-500"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function EquifaxGatewaySimulationPage() {
  const [step, setStep] = useState<Step>("details");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [addressLine, setAddressLine] = useState("");

  const [verifyResult, setVerifyResult] = useState<SimulatedVerifyIdentityResponse | null>(null);
  const [creditFile, setCreditFile] = useState<SimulatedCreditFileResponse | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillDemoData() {
    setFullName(DEMO_FULL_NAME);
    setDateOfBirth(DEMO_DOB);
    setAddressLine(DEMO_ADDRESS);
  }

  async function handleVerify() {
    setError(null);
    setVerifying(true);
    try {
      const res = await api.simulateEquifaxVerifyIdentity(fullName.trim(), dateOfBirth, addressLine.trim());
      setVerifyResult(res);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run the simulated identity check.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRequestCreditFile() {
    if (!verifyResult) return;
    setError(null);
    setRequesting(true);
    try {
      const tokenRes = await api.simulateEquifaxToken(verifyResult.verificationId);
      const fileRes = await api.simulateEquifaxCreditFile(tokenRes.access_token);
      setCreditFile(fileRes);
      setStep("result");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not run the simulated credit file request.");
    } finally {
      setRequesting(false);
    }
  }

  function handleRestart() {
    setStep("details");
    setFullName("");
    setDateOfBirth("");
    setAddressLine("");
    setVerifyResult(null);
    setCreditFile(null);
    setError(null);
  }

  return (
    <AppShell>
      <SimulationBanner disclaimer={verifyResult?.disclaimer ?? creditFile?.disclaimer} />

      <h1 className="text-xl font-semibold text-slate-100">Equifax gateway simulation</h1>
      <p className="mt-1 text-sm text-slate-400">
        An illustration of what a 3-step identity-verification-then-token-then-credit-file flow against a live bureau might look like from
        the outside. Nothing on this page is sent to Equifax or any credit reference agency — every response is generated locally by this
        app.
      </p>

      <StepIndicator step={step} />

      {error && <p className="mb-4 text-sm text-critical">{error}</p>}

      {step === "details" && (
        <div className="max-w-lg rounded-lg border border-border bg-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Step A — Personal details</h2>
            <button
              type="button"
              onClick={fillDemoData}
              className="rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-accent hover:text-accent"
              title="Prefills the form with obviously-fictional demo values, so there's no reason to type your real details into a simulation"
            >
              Fill demo data
            </button>
          </div>

          <label htmlFor="eq-name" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Full name
          </label>
          <input
            id="eq-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Alex Demo"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <label htmlFor="eq-dob" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Date of birth
          </label>
          <input
            id="eq-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <label htmlFor="eq-address" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Address line
          </label>
          <input
            id="eq-address"
            type="text"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="e.g. 12 Sample Street, Leeds, LS1 4AB"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <p className="mt-3 text-xs text-slate-500">
            This is a simulation — it never verifies anything against a real register. Any well-formed input "passes". Consider using the
            "Fill demo data" button above rather than entering your real details.
          </p>

          <button
            onClick={handleVerify}
            disabled={verifying || !fullName.trim() || !dateOfBirth || !addressLine.trim()}
            className="mt-4 flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {verifying && <Spinner />}
            {verifying ? "Verifying (simulated)…" : "Verify identity (simulated)"}
          </button>
        </div>
      )}

      {step === "confirm" && verifyResult && (
        <div className="max-w-lg rounded-lg border border-border bg-panel p-5">
          <h2 className="text-sm font-semibold text-slate-100">Step B — Identity & residence</h2>
          <p className="mt-2 text-sm text-slate-300">
            Simulated status: <span className="font-medium text-good">{verifyResult.status}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Verification ID (simulated, not a real bureau reference): {verifyResult.verificationId}</p>
          <p className="mt-3 text-xs text-slate-500">
            Submitted (locally, not sent anywhere): {fullName} · {dateOfBirth} · {addressLine}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleRequestCreditFile}
              disabled={requesting}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {requesting && <Spinner />}
              {requesting ? "Requesting (simulated)…" : "Request credit file (simulated)"}
            </button>
            <button
              onClick={() => setStep("details")}
              disabled={requesting}
              className="rounded-md border border-border px-3 py-2 text-sm text-slate-300 hover:border-accent hover:text-accent disabled:opacity-60"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === "result" && creditFile && (
        <div className="max-w-lg rounded-lg border border-border bg-panel p-5">
          <h2 className="text-sm font-semibold text-slate-100">Step C — Credit file request result</h2>

          <div className="mt-3 rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Simulated score</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {creditFile.score.value} <span className="text-sm font-normal text-slate-500">/ {creditFile.score.maxValue}</span>
            </p>
            <p className="text-sm text-slate-300">{creditFile.score.band}</p>
            <p className="mt-1 text-xs text-slate-500">{creditFile.score.basis}</p>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Simulated accounts</p>
            <ul className="mt-2 flex flex-col gap-2">
              {creditFile.accounts.map((a, i) => (
                <li key={i} className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.lenderName}</span>
                    <span className="text-xs text-slate-400">{a.status}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {a.accountType} · £{a.balance.toLocaleString("en-GB")}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleRestart}
              className="rounded-md border border-border px-3 py-2 text-sm text-slate-300 hover:border-accent hover:text-accent"
            >
              Start over
            </button>
            <Link
              to="/"
              className="rounded-md border border-border px-3 py-2 text-sm text-slate-300 hover:border-accent hover:text-accent"
            >
              Back to your reports
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
