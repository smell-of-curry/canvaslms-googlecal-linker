import type { tasks_v1 } from "googleapis";
import { validateSyncEnv, WINDOW_DAYS } from "./config";
import {
  createTasksClientOrRunOAuth,
  ensureTasksList,
  listAllTasks,
} from "./google";
import { filterByWindow, getCanvasTodos, normalizeTodos } from "./canvas";
import { extractCidFromNotes, isDueDifferent } from "./utils";

(async () => {
  try {
    // If refresh token missing or UNDEFINED, perform local OAuth and exit with instructions
    const tasks = await createTasksClientOrRunOAuth();
    if (!tasks) return;

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
