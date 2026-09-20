import { describe, expect, it } from "vitest";
import { summarizeUserAgent } from "./session";

describe("summarizeUserAgent", () => {
  it("recognises a common desktop Chrome-on-macOS UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(summarizeUserAgent(ua)).toBe("Chrome on macOS");
  });

  it("recognises Firefox on Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
    expect(summarizeUserAgent(ua)).toBe("Firefox on Windows");
  });

  it("doesn't mistake Chrome's Safari token for actual Safari", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(summarizeUserAgent(ua)).not.toContain("Safari");
  });

  it("recognises real Safari on iOS", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/604.1";
    expect(summarizeUserAgent(ua)).toBe("Safari on iOS");
  });

  it("falls back to 'Unknown device' for empty input", () => {
    expect(summarizeUserAgent(undefined)).toBe("Unknown device");
    expect(summarizeUserAgent("")).toBe("Unknown device");
  });

  it("falls back to 'Unknown device' for an unrecognised UA", () => {
    expect(summarizeUserAgent("SomeCustomBot/1.0")).toBe("Unknown device");
  });
});
