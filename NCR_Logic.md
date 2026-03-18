# Brain: Last_night_ncr.py

## What it does

**Last_night_ncr.py** is a scheduled script that:

1. Logs into the EST Adion systems API.
2. Fetches all Non-Conformance Reports (NCRs).
3. Filters them to NCRs **created** in a fixed “last night” time window (local time).
4. Sends that filtered list to a **Power Automate** webhook so another flow can process or notify.

So in one sentence: **“Get NCRs created last night (by our definition) and push them to Power Automate.”**

---

## Configuration (top of script)

| Variable     | Purpose |
|-------------|---------|
| `ROOT_URL`  | EST API base (e.g. `https://est.adionsystems.com`). |
| `USERNAME` / `PASSWORD` | API login. |
| `SCOPE`     | OAuth-style scope for NCRs, work orders, parts (read). |
| `WEBHOOK_URL` | Power Automate HTTP trigger URL that receives the JSON payload. |

Credentials and webhook URL are in the script; for production, consider env vars or a config file.

---

## Flow (four steps)

### Step 1: Get total NCR count

- One GraphQL call with `pageSize: 1` to `nonConformanceReports`.
- Reads `totalRecords` so the script knows how many NCRs exist in the system.

### Step 2: Fetch all NCRs

- Single GraphQL query with `pageSize: total_records` so **all** NCRs are returned.
- No date filter is done in the API; filtering happens in Python.
- Fields pulled per NCR:
  - `ncrRefNumber`, `createdTime`, `lastModifiedByPlainText`, `notes`
  - `workOrder.workOrderNumber`, `workOrder.part.partDescription`

### Step 3: Time window and filter (in Python)

- **Timezone:** Script uses a fixed offset of **UTC-4** (EDT) for “local” time.
- **Window definition:**
  - **Monday run:** “Last night” = from **Friday 2:30 PM** local to **Monday 6:00 AM** local (covers the weekend).
  - **Tuesday–Friday run:** “Last night” = from **yesterday 4:30 PM** local to **today 6:00 AM** local (overnight shift).
- For each NCR:
  - `createdTime` (API is UTC) is converted to local time.
  - Kept only if it falls **inside** that window.
- For kept NCRs, `notes` is stripped of HTML tags and HTML-entity decoded; then a small payload is built (see below).

### Step 4: Send to Power Automate

- Builds one JSON object: `{ "ncr_records": [ ... ] }`.
- POSTs it to `WEBHOOK_URL` with `Content-Type: application/json`.
- Success is treated as HTTP **202**; any other status or a request exception is reported.

---

## Time window (detailed)

- **Local time** = UTC-4 (no DST handling; always -4).
- **Monday:**
  - Start: (today − 3 days) at **14:30** → Friday 2:30 PM.
  - End: today at **06:00** → Monday 6:00 AM.
- **Tuesday–Friday:**
  - Start: (today − 1 day) at **16:30** → yesterday 4:30 PM.
  - End: today at **06:00** → today 6:00 AM.

So “last night” is always “from late afternoon/evening to 6 AM today,” with Monday covering the weekend.

---

## Payload sent to the webhook

```json
{
  "ncr_records": [
    {
      "ncrRefNumber": "string",
      "workOrderNumber": "string",
      "partDescription": "string",
      "createdById": "string (from lastModifiedByPlainText)",
      "notes": "string (HTML stripped, entities unescaped)",
      "timestamp": "YYYY-MM-DD I:MM AM/PM (local)"
    }
  ]
}
```

- One object per NCR in the window.
- Missing work order or part is represented as `"N/A"` or `"No part description."` as in the script.

---

## API usage

- **Session:** `POST /api/beginsession` with username/password/scope → returns a **token**.
- **GraphQL:** `POST /api/graphql` with `Authorization: Bearer <token>`. Any `errors` in the JSON response are turned into a `RuntimeError`.
- **Power Automate:** `POST` to the webhook URL with the JSON payload; no auth in the script beyond the URL.

---

## Error handling

- Failed HTTP (e.g. 4xx/5xx) on session or GraphQL: `raise_for_status()` or manual `RuntimeError` for GraphQL errors.
- No NCRs from API: script prints and exits.
- No NCRs in the time window: script prints and exits.
- Webhook: non-202 status or `RequestException` is printed; script does not re-raise, so exit code can still be 0 unless the outer `try/except` catches something.

Top-level `if __name__ == "__main__"`: any uncaught exception is printed and the process exits with `sys.exit(1)`.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Get total NCR count from EST API. |
| 2 | Fetch all NCRs (no date filter in API). |
| 3 | Filter by “last night” (local UTC-4 window, Monday vs Tue–Fri rules), clean notes, build payload. |
| 4 | POST `{ "ncr_records": [ ... ] }` to Power Automate webhook; treat 202 as success. |

The script is intended to be run on a schedule (e.g. every morning after 6 AM) so that “last night’s” NCRs are sent to the flow consistently.
