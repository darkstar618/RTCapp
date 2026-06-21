# RTC Platform

Production-ready WebRTC platform with an auth service, RTC API, Android SDK (LiveKit), and Expo demo client.

## Architecture

```
┌─────────────┐     SDK JWT      ┌──────────────┐     LiveKit token   ┌─────────────┐
│ Expo demo   │ ───────────────► │ Auth server  │ ──────────────────► │  LiveKit    │
│ (Android)   │                  │  :3001       │                     │   Cloud     │
└──────┬──────┘                  └──────────────┘                     └─────────────▲
       │                                                                               │
       │ SDK JWT + REST                                                                 │
       ▼                                                                               │
┌──────────────┐   session tokens   ┌──────────────────────────────────────────────┘
│  RTC API     │ ─────────────────► │ channels, billing, webhooks, analytics, admin
│  :3002       │
└──────────────┘
```

**Important:** Never embed `app_secret` in a mobile app. Production apps must use a **backend-for-frontend** that holds secrets server-side and returns short-lived SDK tokens.

---

## Prerequisites

- Node.js 20+
- LiveKit Cloud project (API key, secret, URL)
- Android Studio / emulator for native RTC testing

---

## 1. Environment setup

### Auth server (`server/auth/.env`)

```bash
cp server/auth/.env.example server/auth/.env
```

| Variable | Description |
|---|---|
| `JWT_SECRET` | Signs SDK access + developer dashboard tokens |
| `LIVEKIT_API_KEY` | From LiveKit dashboard |
| `LIVEKIT_API_SECRET` | From LiveKit dashboard |
| `LIVEKIT_URL` | e.g. `wss://your-project.livekit.cloud` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (required in production) |
| `PORT` | Default `3001` |

### API server (`server/api/.env`)

```bash
cp server/api/.env.example server/api/.env
```

| Variable | Description |
|---|---|
| `JWT_SECRET` | **Must match** auth server |
| `SDK_SESSION_JWT_SECRET` | Signs short-lived RTC session JWTs |
| `DEV_DASHBOARD_JWT_SECRET` | **Must match** auth `JWT_SECRET` |
| `ADMIN_SECRET` | Admin API key for `/v1/admin/*` |
| `LIVEKIT_*` | Same LiveKit credentials |
| `REDIS_HOST` / `REDIS_PORT` | Optional; enables distributed rate limiting |
| `ALLOWED_ORIGINS` | Required in production |
| `PORT` | Default `3002` |

### Demo client (root `.env`)

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_AUTH_URL` | Auth server URL (HTTPS in production) |
| `EXPO_PUBLIC_RTC_URL` | API server URL (HTTPS in production) |
| `EXPO_PUBLIC_APP_ID` | Your `ap_*` app ID |
| `EXPO_PUBLIC_DEMO_APP_SECRET` | **Demo only** — never ship in production APKs |

---

## 2. Install & run

```bash
# Root (Expo app + SDK)
npm install

# Auth server
cd server/auth && npm install && npm start

# API server (separate terminal)
cd server/api && npm install && npm start

# Expo demo (separate terminal)
npx expo start
```

Health checks:

- Auth: `http://localhost:3001/health`
- API: `http://localhost:3002/health`
- Admin UI: `http://localhost:3002/admin.html`

---

## 3. Developer workflow

1. Register: `POST /auth/register` → developer JWT
2. Create project: `POST /projects`
3. Create API key: `POST /projects/:id/keys` → `app_id` + `app_secret` (store secret server-side only)
4. Exchange credentials: `POST /sdk/token` → SDK access token
5. Use SDK token for RTC API calls and LiveKit token requests

---

## 4. Security model

| Token type | Signed with | Used for |
|---|---|---|
| `sdk_access` | `JWT_SECRET` | Channels, LiveKit token requests |
| `rtc_session` | `SDK_SESSION_JWT_SECRET` | Per-call RTC session only |
| `developer_dashboard` | `JWT_SECRET` / `DEV_DASHBOARD_JWT_SECRET` | Billing, webhooks, analytics |

- Rate limiting on auth and API endpoints
- Webhook SSRF protection + timestamped HMAC signatures
- Admin auth uses constant-time comparison
- CORS disabled in production unless `ALLOWED_ORIGINS` is set
- Structured logging with secret redaction (pino)

---

## 5. Android release builds

Set keystore env vars before building:

```bash
RELEASE_STORE_FILE=/path/to/release.keystore
RELEASE_STORE_PASSWORD=...
RELEASE_KEY_ALIAS=...
RELEASE_KEY_PASSWORD=...
```

Without these, release builds fall back to debug signing (local dev only).

---

## 6. Testing

```bash
npm test                          # SDK unit tests
cd server/api && npm test         # API utility tests
```

CI runs on push/PR via `.github/workflows/ci.yml`.

---

## 7. Project layout

```
src/                  Expo demo client
packages/sdk/         @yourplatform/sdk (Android RTC SDK)
server/auth/          Token issuer + developer auth
server/api/           RTC/billing/webhooks/admin API
load-test/            Dev-only load testing scripts
```

---

## License

MIT
