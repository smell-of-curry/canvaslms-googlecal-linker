import dotenv from "dotenv";
dotenv.config();

// --- Env ---
export const {
  CANVAS_BASE, // e.g. https://uk.instructure.com
  CANVAS_TOKEN, // personal token OR your app's OAuth access token
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GOOGLE_TASKS_LIST_NAME = "Canvas (auto)",
  WINDOW_DAYS = "30", // look ahead this many days
} = process.env;

export const REDIRECT_URI = "http://localhost:4000/oauth2callback";
export const CANVAS_HEADERS = { Authorization: `Bearer ${CANVAS_TOKEN}` };

/**
 * Validates presence of required environment variables.
 *
 * @throws with a helpful message listing missing variables. This is called
 * after OAuth setup so the program can fail fast with clear guidance.
 */
export function validateSyncEnv() {
  const missing: string[] = [];
  if (!CANVAS_BASE) missing.push("CANVAS_BASE");
  if (!CANVAS_TOKEN) missing.push("CANVAS_TOKEN");
  if (!GOOGLE_CLIENT_ID) missing.push("GOOGLE_CLIENT_ID");
  if (!GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET");
  if (!GOOGLE_REFRESH_TOKEN || GOOGLE_REFRESH_TOKEN === "UNDEFINED")
    missing.push("GOOGLE_REFRESH_TOKEN");
  if (missing.length)
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}