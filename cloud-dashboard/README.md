# Cloud Dashboard (GitHub Pages)

This folder contains a static proof-of-concept cloud dashboard for `pid_tilt_propellers`.

## Security model

- The dashboard uses **only** Supabase's publishable key from `cloud-dashboard/app.js`.
- Do **not** place the Supabase secret key, service-role key, or DB password in this frontend.
- All critical motor safety remains on the Raspberry Pi backend.

## Features

- Auth via Supabase Auth (`signInWithPassword`) with a fallback **demo mode**.
- Reads and displays:
  - `device_shadow`
  - `telemetry_samples` (recent)
  - `events` (recent)
  - `remote_commands` (recent command statuses)
- Inserts commands into `remote_commands`, including emergency stop.
- Beam digital twin animation using `fused_angle_deg` or `raw_angle_deg`.
- Manual motor UI limited to 0-40% (Pi still enforces final limits).
- Realtime subscriptions for key tables with 1-second polling fallback.

## Files

```text
cloud-dashboard/
  index.html
  app.js
  style.css
  README.md
```

## Configuration

Edit placeholders in `app.js`:

```js
const SUPABASE_URL = "https://PROJECT_ID.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "PUBLISHABLE_KEY_ONLY";
```

## Required Supabase tables

The dashboard expects these public tables (or policies allowing read/insert where needed):

- `device_shadow` (read)
- `telemetry_samples` (read)
- `events` (read)
- `remote_commands` (read + insert by publishable key policy)

## Command flow and safety

This dashboard **does not directly control motors**.
It only inserts rows in `remote_commands`. The Raspberry Pi command poller (running roughly every second) decides whether commands are valid and safe to execute.

Backend safety is authoritative.

## GitHub Pages deployment

1. Commit `cloud-dashboard/`.
2. In GitHub repo settings, enable **Pages**.
3. Select deploy source that serves this folder (for example, branch root with `/cloud-dashboard` path if your Pages setup supports it, or copy the folder contents to the configured Pages root).
4. Open the published URL and verify device data and command insertion.
