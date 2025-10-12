import { spawn } from "child_process";

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

export function toIsoDue(due?: string | null): string | undefined {
  if (!due) return undefined;
  // If date-only (YYYY-MM-DD), normalize to midnight UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return `${due}T00:00:00.000Z`;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function extractCidFromNotes(notes?: string | null): string | undefined {
  if (!notes) return undefined;
  const lines = notes.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*CID:\s*(.+)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

export function isDueDifferent(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return false;
  if (!!a !== !!b) return true;
  if (!a || !b) return true;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return ta !== tb;
}
