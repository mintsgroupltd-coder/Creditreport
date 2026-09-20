/**
 * A deliberately coarse, best-effort summary of a User-Agent string for
 * display on the "your devices" settings screen (e.g. "Chrome on
 * macOS") — not a device fingerprint and not used for any security
 * decision, purely descriptive so a session list is readable instead of
 * showing raw UA strings. Falls back to "Unknown device" for anything
 * it doesn't recognise rather than guessing.
 */
export function summarizeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
          ? "Safari"
          : null;

  // iPhone/iPad must be checked before "Mac OS X" — an iOS UA string
  // itself contains "like Mac OS X" (e.g. "CPU iPhone OS 17_5 like Mac
  // OS X"), so testing desktop macOS first would misclassify it.
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Windows/.test(userAgent)
      ? "Windows"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Android/.test(userAgent)
          ? "Android"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "Unknown device";
}
