import { CANVAS_BASE, CANVAS_HEADERS } from "./config";
import { CanvasTodo, NormalizedTodo } from "./types";
import { toIsoDue } from "./utils";

/**
 * Fetches the authenticated user's Canvas To‑Do items.
 * Uses `GET /api/v1/users/self/todo` on the `CANVAS_BASE` with `CANVAS_TOKEN`.
 * 
 * @throws if the HTTP response is not OK.
 * @returns Promise that resolves to the raw Canvas To‑Do array.
 */
export async function getCanvasTodos() {
  const url = `${CANVAS_BASE}/api/v1/users/self/todo`;
  const res = await fetch(url, { headers: CANVAS_HEADERS });
  if (!res.ok) throw new Error(`Canvas todo ${res.status}`);
  const data = (await res.json()) as CanvasTodo[];
  console.log(
    `[Canvas] fetched ${Array.isArray(data) ? data.length : 0} items`
  );
  return data;
}

/**
 * Builds a stable content ID (CID) for a Canvas To‑Do item.
 *
 * Preference order:
 * 1) Assignment id, 2) `html_url`, 3) fallback tuple of title + due.
 *
 * @param todo Canvas To‑Do item
 * @returns CID string used to de‑duplicate across runs
 */
function buildCid(todo: CanvasTodo): string {
  if (todo.assignment?.id != null) return `A:${todo.assignment.id}`;
  if (todo.html_url) return `U:${todo.html_url}`;
  const title = todo.assignment?.name || todo.title || "untitled";
  const due = todo.assignment?.due_at || todo.due_at || "";
  return `FALLBACK:${title}:${due}`;
}

/**
 * Produces a human‑readable notes block that embeds the CID and source metadata.
 *
 * Includes `Course:` and `URL:` lines when available so the user can quickly
 * navigate back to Canvas from Google Tasks.
 *
 * @param cid Previously computed content id
 * @param todo Canvas To‑Do item
 * @returns Multi‑line notes string
 */
function buildNotes(cid: string, todo: CanvasTodo): string {
  const course = todo.context_name ? `\nCourse: ${todo.context_name}` : "";
  const url = todo.assignment?.html_url || todo.html_url;
  const urlLine = url ? `\nURL: ${url}` : "";
  return `CID: ${cid}\nSource: Canvas${course}${urlLine}`;
}

/**
 * Normalizes raw Canvas To‑Do items into the internal shape used for syncing.
 *
 * - Derives a stable `cid`
 * - Picks a title from assignment name or generic title
 * - Converts due dates to RFC3339 with `toIsoDue`
 * - Embeds source metadata into `notes`
 *
 * @param items Raw Canvas To‑Do items
 * @returns Array of normalized To‑Do items
 */
export function normalizeTodos(items: CanvasTodo[]): NormalizedTodo[] {
  return items
    .map((it) => {
      const cid = buildCid(it);
      const title = it.assignment?.name || it.title || "Canvas To‑Do";
      const due = toIsoDue(it.assignment?.due_at ?? it.due_at ?? undefined);
      const notes = buildNotes(cid, it);
      return { cid, title, due, notes } satisfies NormalizedTodo;
    })
    .filter(Boolean);
}

/**
 * Filters normalized To‑Dos to those due within the next `windowDays` days.
 *
 * Items without a due date are excluded.
 *
 * @param todos Normalized To‑Do list
 * @param windowDays Number of days ahead to include
 * @returns Subset of items due within the window
 */
export function filterByWindow(
  todos: NormalizedTodo[],
  windowDays: number
): NormalizedTodo[] {
  const now = Date.now();
  const end = now + windowDays * 24 * 60 * 60 * 1000;
  return todos.filter((t) => {
    if (!t.due) return false; // skip undated
    const dueMs = new Date(t.due).getTime();
    return dueMs >= now && dueMs <= end;
  });
}
