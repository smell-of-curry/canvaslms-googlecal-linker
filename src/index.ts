import fetch from "node-fetch";
import { google } from "googleapis";
import type { tasks_v1 } from "googleapis";
import { createServer } from "http";
import { URL } from "url";
import { spawn } from "child_process";
import dotenv from "dotenv";
dotenv.config();

// --- Env ---
const {
  CANVAS_BASE, // e.g. https://uk.instructure.com
  CANVAS_TOKEN, // personal token OR your app's OAuth access token
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  TASKS_LIST_NAME = "Canvas (auto)",
  WINDOW_DAYS = "30", // look ahead this many days
} = process.env;

const REDIRECT_URI = "http://localhost:3000/oauth2callback";

function validateGoogleEnvBasic() {
  const missing: string[] = [];
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

function validateSyncEnv() {
  const missing: string[] = [];
  if (!CANVAS_BASE) missing.push("CANVAS_BASE");
  if (!CANVAS_TOKEN) missing.push("CANVAS_TOKEN");
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_REFRESH_TOKEN || GOOGLE_REFRESH_TOKEN === "UNDEFINED") missing.push("GOOGLE_REFRESH_TOKEN");
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

function tryOpenInBrowser(url: string) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true });
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

async function performLocalGoogleOAuth(): Promise<string> {
  validateGoogleEnvBasic();
  const oAuth2 = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );

  const authorizeUrl = oAuth2.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/tasks"],
    prompt: "consent",
  });

  console.log("[Google OAuth] Opening browser for consent...");
  console.log(authorizeUrl);
  tryOpenInBrowser(authorizeUrl);

  return await new Promise<string>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }
        if (!req.url.startsWith("/oauth2callback")) {
          res.statusCode = 404;
          res.end("Not Found");
          return;
        }
        const qs = new URL(req.url, REDIRECT_URI).searchParams;
        const code = qs.get("code");
        if (!code) {
          res.statusCode = 400;
          res.end("Missing 'code' param in callback");
          reject(new Error("Missing code param"));
          server.close();
          return;
        }
        const { tokens } = await oAuth2.getToken(code);
        if (!tokens.refresh_token) {
          res.statusCode = 500;
          res.end("No refresh token received. Try removing prior consent and retry.");
          reject(new Error("No refresh token returned by Google"));
          server.close();
          return;
        }
        oAuth2.setCredentials(tokens);
        res.statusCode = 200;
        res.end("Authentication successful! You can close this tab.\nYour refresh token is: '" + tokens.refresh_token + "'");
        server.close();
        resolve(tokens.refresh_token);
      } catch (e) {
        res.statusCode = 500;
        res.end("Error during OAuth flow.");
        server.close();
        reject(e as Error);
      }
    });

    server.listen(3000, () => {
      console.log("[Google OAuth] Listening on http://localhost:3000 ...");
    });
  });
}

async function createTasksClientOrRunOAuth(): Promise<tasks_v1.Tasks | null> {
  validateGoogleEnvBasic();
  const needsOAuth = !GOOGLE_REFRESH_TOKEN || GOOGLE_REFRESH_TOKEN === "UNDEFINED";
  if (needsOAuth) {
    const refreshToken = await performLocalGoogleOAuth();
    console.log("\nAdd this to your environment and re-run:");
    console.log(`GOOGLE_REFRESH_TOKEN="${refreshToken}"`);
    return null;
  }
  const oAuth2 = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );
  oAuth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN || "" });
  return google.tasks({ version: "v1", auth: oAuth2 });
}

const headers = { Authorization: `Bearer ${CANVAS_TOKEN}` };

type CanvasAssignment = {
  id: number;
  name: string;
  due_at?: string | null;
  html_url?: string;
};

type CanvasTodo = {
  type: string;
  assignment?: CanvasAssignment;
  context_name?: string;
  html_url?: string;
  due_at?: string | null;
  course_id?: number;
  title?: string; // some types may expose a title directly
};

type NormalizedTodo = {
  cid: string;
  title: string;
  due?: string | undefined; // RFC3339 timestamp
  notes: string;
};

/**
 * Gets the Canvas todos
 * @returns
 */
async function getCanvasTodos() {
  const url = `${CANVAS_BASE}/api/v1/users/self/todo`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Canvas todo ${res.status}`);
  const data = (await res.json()) as CanvasTodo[];
  console.log(`[Canvas] fetched ${Array.isArray(data) ? data.length : 0} items`);
  return data;
}

function toIsoDue(due?: string | null): string | undefined {
  if (!due) return undefined;
  // If date-only (YYYY-MM-DD), normalize to midnight UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return `${due}T00:00:00.000Z`;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
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

function normalizeTodos(items: CanvasTodo[]): NormalizedTodo[] {
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

function filterByWindow(todos: NormalizedTodo[], windowDays: number): NormalizedTodo[] {
  const now = Date.now();
  const end = now + windowDays * 24 * 60 * 60 * 1000;
  return todos.filter((t) => {
    if (!t.due) return false; // skip undated
    const dueMs = new Date(t.due).getTime();
    return dueMs >= now && dueMs <= end;
  });
}

/**
 * Ensures the Tasks list exists
 * @param tasks
 * @returns
 */
async function ensureTasksList(tasks: tasks_v1.Tasks) {
  const lists = await tasks.tasklists.list();
  const found = (lists.data.items || []).find(
    (l) => l.title === TASKS_LIST_NAME
  );
  if (found) return found.id!;
  const created = await tasks.tasklists.insert({
    requestBody: { title: TASKS_LIST_NAME },
  });
  return created.data.id!;
}

async function listAllTasks(tasks: tasks_v1.Tasks, tasklist: string) {
  const all: tasks_v1.Schema$Task[] = [];
  let pageToken: string | undefined = undefined;
  do {
    const params: tasks_v1.Params$Resource$Tasks$List = {
      tasklist,
      maxResults: 100,
      showCompleted: false,
      showHidden: false,
      showDeleted: false,
    };
    if (pageToken) params.pageToken = pageToken;
    const res = await tasks.tasks.list(params);
    const items = res.data.items || [];
    all.push(...items);
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return all;
}

function extractCidFromNotes(notes?: string | null): string | undefined {
  if (!notes) return undefined;
  const lines = notes.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*CID:\s*(.+)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

function isDueDifferent(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return false;
  if (!!a !== !!b) return true;
  if (!a || !b) return true;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return ta !== tb;
}

(async () => {
  try {
    // If refresh token missing or UNDEFINED, perform local OAuth and exit with instructions
    const tasks = await createTasksClientOrRunOAuth();
    if (!tasks) {
      return;
    }

    validateSyncEnv();
    const listId = await ensureTasksList(tasks);

    const rawTodos = await getCanvasTodos();
    const normalized = normalizeTodos(rawTodos);
    const windowDays = Number.isFinite(Number(WINDOW_DAYS))
      ? Number(WINDOW_DAYS)
      : 30;
    const scoped = filterByWindow(normalized, windowDays);

    const existing = await listAllTasks(tasks, listId);
    const existingByCid = new Map<string, tasks_v1.Schema$Task>();
    for (const t of existing) {
      const cid = extractCidFromNotes(t.notes);
      if (cid) existingByCid.set(cid, t);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const it of scoped) {
      const requestBody: tasks_v1.Schema$Task = {
        title: it.title,
        due: it.due ?? null,
        notes: it.notes,
      };

      const found = existingByCid.get(it.cid);
      if (found) {
        const needsUpdate =
          (found.title || "") !== it.title ||
          isDueDifferent(found.due, it.due) ||
          (found.notes || "") !== it.notes;
        if (needsUpdate) {
          await tasks.tasks.patch({
            tasklist: listId,
            task: found.id!,
            requestBody,
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await tasks.tasks.insert({ tasklist: listId, requestBody });
        created += 1;
      }
    }

    console.log(
      `[Sync] Completed. created=${created} updated=${updated} skipped=${skipped} (windowDays=${windowDays})`
    );
  } catch (err) {
    console.error("[Error]", err);
    process.exitCode = 1;
  }
})();
