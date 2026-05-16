# Chrome extension integration (Nest API)

Checklist for the Seam MV3 extension calling this backend.

## Base URL

- Extension env: same host as dashboard `VITE_API_BASE_URL` (e.g. `http://localhost:3000` in dev).

## CORS

Set on the API (not per project):

```env
CORS_ORIGINS=https://app.example.com,http://localhost:5173,chrome-extension://YOUR_EXTENSION_ID
```

- **Production:** `CORS_ORIGINS` is required for browser clients; include the exact `chrome-extension://` origin from `chrome://extensions`.
- **Development:** if `CORS_ORIGINS` is empty and `NODE_ENV` is not `production`, all origins are allowed (legacy dev behavior).

## Authentication

- Use **`Authorization: Bearer <access_token>`** on API routes (same JWT as dashboard if you obtain it after login).
- Cookie-based auth may work when the extension shares the dashboard cookie jar; Bearer is the reliable choice for MV3 `fetch` from the service worker.

## Optional logging header

```http
X-Seam-Client: extension
```

Logged as `seamClient` in structured HTTP logs (support/debug only; not used for authorization).

## Meeting upload

```http
POST /projects/{projectId}/meetings
Authorization: Bearer <token>
Content-Type: multipart/form-data
X-Seam-Client: extension

file: <binary audio>
```

- Max body size: **`MEETING_UPLOAD_MAX_MB`** on the API (default **500** MB). Match reverse-proxy limits (nginx `client_max_body_size`, etc.).
- Nest dispatches to ai-engine-2 and returns when the engine responds **202**; full processing finishes via webhook. Long uploads may need **`AI_ENGINE_REQUEST_TIMEOUT_MS`** high enough for Cloudinary + dispatch.

## Realtime (optional)

- Socket.IO uses the same CORS rules as HTTP (`CORS_ORIGINS`).
- Connect with JWT (see `RealtimeGateway`).

## Related docs

- Meeting flow: `src/meeting/README.md`
- Background jobs: `src/infrastracture/scheduling/README.md`
