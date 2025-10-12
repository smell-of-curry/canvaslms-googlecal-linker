import { CANVAS_BASE, CANVAS_HEADERS } from "./config";
import { CanvasTodo, NormalizedTodo } from "./types";
import { toIsoDue } from "./utils";

/**
 * Gets the Canvas todos
 * @returns
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

function buildCid(todo: CanvasTodo): string {
  if (todo.assignment?.id != null) return `A:${todo.assignment.id}`;
  if (todo.html_url) return `U:${todo.html_url}`;
  const title = todo.assignment?.name || todo.title || "untitled";
  const due = todo.assignment?.due_at || todo.due_at || "";
  return `FALLBACK:${title}:${due}`;
}

function buildNotes(cid: string, todo: CanvasTodo): string {
  const course = todo.context_name ? `\nCourse: ${todo.context_name}` : "";
  const url = todo.assignment?.html_url || todo.html_url;
  const urlLine = url ? `\nURL: ${url}` : "";
  return `CID: ${cid}\nSource: Canvas${course}${urlLine}`;
}

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
