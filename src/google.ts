import { tryOpenInBrowser } from "./utils";
import { createServer } from "http";
import { URL } from "url";
import { google } from "googleapis";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_TASKS_LIST_NAME, REDIRECT_URI } from "./config";
import type { tasks_v1 } from "googleapis";

export async function performLocalGoogleOAuth(): Promise<string> {
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
          res.end(
            "No refresh token received. Try removing prior consent and retry."
          );
          reject(new Error("No refresh token returned by Google"));
          server.close();
          return;
        }
        oAuth2.setCredentials(tokens);
        res.statusCode = 200;
        res.end(
          "Authentication successful! You can close this tab.\nYour refresh token is: '" +
            tokens.refresh_token +
            "'"
        );
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

export async function createTasksClientOrRunOAuth(): Promise<tasks_v1.Tasks | null> {
  const needsOAuth =
    !GOOGLE_REFRESH_TOKEN || GOOGLE_REFRESH_TOKEN === "UNDEFINED";
  if (needsOAuth) {
    const refreshToken = await performLocalGoogleOAuth();
    console.log("\nAdd this to your environment and re-run:");
    console.log(`GOOGLE_REFRESH_TOKEN="${refreshToken}"`);
    return null;
  }
  const oAuth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oAuth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN || "" });
  return google.tasks({ version: "v1", auth: oAuth2 });
}

/**
 * Ensures the Tasks list exists
 * @param tasks
 * @returns
 */
export async function ensureTasksList(tasks: tasks_v1.Tasks) {
  const lists = await tasks.tasklists.list();
  const found = (lists.data.items || []).find(
    (l) => l.title === GOOGLE_TASKS_LIST_NAME
  );
  if (found) return found.id!;
  const created = await tasks.tasklists.insert({
    requestBody: { title: GOOGLE_TASKS_LIST_NAME },
  });
  return created.data.id!;
}

export async function listAllTasks(tasks: tasks_v1.Tasks, tasklist: string) {
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
