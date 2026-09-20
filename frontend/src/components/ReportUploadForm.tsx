import { ChangeEvent, useRef, useState } from "react";
import { api, ApiError } from "../api/client";

/**
 * The minimal "pick a file, upload it, go to its report page" flow —
 * extracted out of DashboardPage so RemediationPage's step 1 can embed
 * the exact same upload behaviour instead of rebuilding it.
 */
export function ReportUploadForm({
  onUploaded,
  onError,
  label = "Upload report",
}: {
  onUploaded: (reportId: string) => void;
  onError?: (message: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLocalError(null);
    setUploading(true);
    try {
      const result = await api.uploadReport(file);
      onUploaded(result.reportId);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Upload failed — please try again.";
      setLocalError(message);
      onError?.(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="inline-block cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
        {uploading ? "Uploading…" : label}
        <input ref={fileInputRef} type="file" accept=".pdf,.csv" onChange={handleFileChange} disabled={uploading} className="hidden" />
      </label>
      {localError && <p className="mt-2 text-sm text-critical">{localError}</p>}
    </div>
  );
}
