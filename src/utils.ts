import { spawn } from "child_process";

/**
 * Attempts to open a URL in the default system browser in a best‑effort way.
 * Silent no‑op on failure so callers can still print the URL for copy/paste.
 *
 * @param url Absolute URL to open
 */
export function tryOpenInBrowser(url: string) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        stdio: "ignore",
        detached: true,
      });
      return;
    }
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true });
      return;
    }
    spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  } catch {
    // no-op; user can copy/paste URL
  }
}

/**
 * Normalizes various Canvas due date strings into RFC3339 (ISO 8601) format.
 *
 * - Accepts date‑only strings (YYYY‑MM‑DD) and converts to midnight UTC.
 * - Returns `undefined` for falsy or invalid dates.
 *
 * @param due Input date string from Canvas
 * @returns RFC3339 string or `undefined`
 */
export function toIsoDue(due?: string | null): string | undefined {
  if (!due) return undefined;
  // If date-only (YYYY-MM-DD), normalize to midnight UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return `${due}T00:00:00.000Z`;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Extracts the `CID:` line value from a multi‑line notes string.
 *
 * @param notes Google Tasks notes field content
 * @returns Extracted CID or `undefined`
 */
export function extractCidFromNotes(notes?: string | null): string | undefined {
  if (!notes) return undefined;
  const lines = notes.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*CID:\s*(.+)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Checks whether the notes string indicates the task originated from Canvas.
 *
 * @param notes Google Tasks notes field content
 * @returns True if a line equals `Source: Canvas`
 */
export function isCanvasSource(notes?: string | null): boolean {
  if (!notes) return false;
  const lines = notes.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*Source:\s*Canvas\s*$/i.test(line)) return true;
  }
  return false;
}

/**
 * Compares two optional due timestamps for semantic inequality.
 * Handles nullish values and compares by epoch milliseconds.
 *
 * @param a First due timestamp
 * @param b Second due timestamp
 * @returns True when different, false when equivalent
 */
export function isDueDifferent(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return false;
  if (!!a !== !!b) return true;
  if (!a || !b) return true;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return ta !== tb;
}
