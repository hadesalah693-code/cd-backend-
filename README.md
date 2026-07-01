# dentist370 + dentistsbook backend

Fastify + Prisma + PostgreSQL backend serving two contracts from one service:

- `/v1/*` — implements dentist370's existing `Cloud` client exactly as written in
  `app/app.js:7106-7193` (auth, license, encrypted sync, push subscriptions). No
  changes to `app.js` are required.
- `/v1/platform/*` — dentistsbook recruitment endpoints (phase 1 of the roadmap in
  `00-ARCHITECTURE-البنية-المعمارية.html`, section 10). Verified via a JWT signed
  with `LICENSE_SIGNING_SECRET` — the single link between the two products
  (architecture doc section 6).

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, ACCESS_TOKEN_SECRET, LICENSE_SIGNING_SECRET
npx prisma migrate dev --name init
npm run dev             # starts on http://localhost:3000
```

`DATABASE_URL` can point at a local Postgres or a Supabase project's connection string.

## Linking the real app to this backend

1. Run the backend locally (`npm run dev`).
2. Open `app/index.html` in a browser, log in, go to **Settings → Cloud Sync**.
3. Paste `http://localhost:3000` into the API URL field (`DB.meta.cloud.apiUrl`).
4. Register a clinic from the app UI — this calls `POST /v1/auth/register` on this
   server. From here, login/license-activation/sync all work against real data.

## Endpoint contract (must stay byte-for-byte compatible with app.js's Cloud client)

| Endpoint | Source in app.js |
|---|---|
| `POST /v1/auth/register` | app.js:7124 |
| `POST /v1/auth/login` | app.js:7128 |
| `POST /v1/auth/refresh` | app.js:7132 |
| `POST /v1/auth/logout` | app.js:7145 |
| `POST /v1/auth/google` | `Cloud.loginWithGoogle` — requires `GOOGLE_CLIENT_ID` in `.env`, returns 501 otherwise |
| `POST /v1/license/activate` | app.js:7168 |
| `GET /v1/license/me` | app.js:7172 |
| `POST /v1/sync/push` | app.js:7178 |
| `GET /v1/sync/pull` | app.js:7185 |
| `POST /v1/tasks/staff/:id/subscriptions` | app.js:7043 |

If any of these shapes change, update `app/app.js`'s `Cloud` object to match —
do not silently change the contract from the server side only.

## Platform (dentistsbook) endpoints — phase 1

| Endpoint | Auth |
|---|---|
| `GET /v1/platform/doctors?region=&availability=` | public |
| `GET /v1/platform/doctors/:doctorId` | public |
| `POST /v1/platform/doctors/me` | Bearer `platformToken` (from `/v1/license/me`) |
| `POST /v1/platform/doctors/me/cases` | Bearer `platformToken` |

`channels`, `videos`, `purchases`, `buyers`, `clinicOwners`, `inquiries`, and
`transactions` exist in `prisma/schema.prisma` but have no routes yet — they're
scaffolded for the education/payments/messaging phases (roadmap steps 3-5).

## Notes

- Refresh tokens are stored as SHA-256 hashes, never in plaintext.
- Sync blobs are stored as opaque ciphertext (AES-256-GCM, encrypted client-side) —
  this server never has the key and cannot read clinic data.
- License keys use a self-contained `MX-<TIER>-<RANDOM>-<CHECKSUM>` format
  (`src/lib/licenseKey.ts`), validated server-side independent of the app's
  offline `LIC.parse` (app.js:1798), which still works for fully offline clinics.
