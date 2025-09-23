# Canvas LMS Google Tasks Link

Auto Syncs a CanvasLMS Student's ToDo list to Google Tasks.

Made for use by Reclaim.ai, to streamline my tasks to my Google Calendar.

## Credentials

### Canvas
#### Personal use (fastest):

In Canvas: Account → Settings → New Access Token (or “Manage API access tokens”).
Copy the token and keep it secret. (Schools can restrict this; if it’s disabled, you’ll need an admin-issued token or full OAuth.) 

#### Multi-user app:

Register an OAuth Developer Key in Canvas, then do OAuth on behalf of each user. (Canvas supports scope-limited keys; for testing, a manual token is fine.)

### Google

1. Login to Google Cloud Console
2. Create a new project named: `CanvasLMS Google Tasks Link`
3. Select the project
4. Go to: `https://console.cloud.google.com/apis/library/tasks.googleapis.com`
5. Click on the `Enable` button
6. Press Create Credentials & Ensure Google Tasks API is Selected
7. Select User Data
8. ((2) OAuth Consent Screen) Enter same App Name, and use your email
9. Press Add or Remove Scopes & Enable `../auth/tasks`
10. Download the JSON file and rename it to `google-credentials.json`

Create a Google Cloud project → enable Google Tasks API → create an OAuth client (Web application) → set consent screen + scopes (https://www.googleapis.com/auth/tasks). Do a one-time local OAuth to get a refresh token; store it as a GitHub secret.

## How it works

By a Github Action Cron Job, we run a process every 15 minutes to check for newly created todo items.

Using Canvas's `GET /api/v1/users/self/todo` to get the student's ToDo list.
Then using `POST tasks/v1/lists/{tasklistId}/tasks` from Google's API to create the tasks in Google Tasks.