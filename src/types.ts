/**
 * Minimal Canvas assignment shape as returned by the To‑Do endpoint.
 */
export type CanvasAssignment = {
  id: number;
  name: string;
  due_at?: string | null;
  html_url?: string;
};

/**
 * Union‑ish Canvas To‑Do item shape covering assignments and generic items.
 */
export type CanvasTodo = {
  type: string;
  assignment?: CanvasAssignment;
  context_name?: string;
  html_url?: string;
  due_at?: string | null;
  course_id?: number;
  title?: string; // some types may expose a title directly
};

/**
 * Internal normalized To‑Do used for syncing into Google Tasks.
 */
export type NormalizedTodo = {
  cid: string;
  title: string;
  due?: string | undefined; // RFC3339 timestamp
  notes: string;
};
