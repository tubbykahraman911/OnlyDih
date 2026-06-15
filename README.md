# OnlyDihs Phase 1 Private Analyzer

OnlyDihs Phase 1 is a private adult-only image analyzer MVP. It does not include livestreaming, public sharing, user matching, comments, DMs, public galleries, public profiles, leaderboards, battle mode, or sharing links.

The safety model is intentionally strict: verified adults only, private upload only, private score only, explicit consent per upload, owner-only results, short-lived private upload URLs, audit logging, and user deletion controls.

## Apps

- `apps/web`: Next.js App Router frontend.
- `apps/api`: Express TypeScript API with Prisma/Postgres, Redis/BullMQ, private S3/R2 storage, Stripe Identity, xAI/Grok analysis, cookie sessions, CSRF, rate limits, and ownership checks.
- `apps/ai-service`: optional FastAPI analyzer reference service; production analysis is handled by `apps/api`.

## Build Commands

API:

```bash
pnpm --filter @onlydihs/api build
pnpm --filter @onlydihs/api start
```

Web:

```bash
pnpm --filter @onlydihs/web build
```

Database migrations:

```bash
pnpm --filter @onlydihs/api db:deploy
```

## Local API Env

Use `apps/api/.env`:

```bash
NODE_ENV="development"
PORT=8080
HOST="127.0.0.1"
APP_BASE_URL="http://localhost:3000"
WEB_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/onlydihs?schema=public"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="replace-with-at-least-24-random-characters"
VERIFICATION_PROVIDER="placeholder"
VERIFICATION_PROVIDER_API_KEY="placeholder"
VERIFICATION_WEBHOOK_SECRET="replace-with-webhook-secret"
STRIPE_SECRET_KEY=""
STRIPE_IDENTITY_RESTRICTED_KEY=""
STRIPE_WEBHOOK_SECRET=""
STRIPE_IDENTITY_RETURN_URL="http://127.0.0.1:3000/verification"
AI_PROVIDER="xai"
XAI_API_KEY=""
XAI_MODEL="grok-4.3"
S3_ENDPOINT=""
S3_REGION="auto"
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
RAW_UPLOAD_RETENTION_HOURS=24
```

Local uploads work without S3/R2 when the S3 variables are empty. Local xAI falls back to the placeholder analyzer when `XAI_API_KEY` is empty.

## Production API Env

Set these on Railway or Render:

```bash
NODE_ENV="production"
PORT=8080
DATABASE_URL="SUPABASE_POOLER_OR_DIRECT_DATABASE_URL"
REDIS_URL="REDIS_URL_FROM_RAILWAY_RENDER_OR_UPSTASH"
SESSION_SECRET="STRONG_RANDOM_SECRET"
APP_BASE_URL="https://YOUR_VERCEL_WEB_DOMAIN"
WEB_ORIGINS="https://YOUR_VERCEL_WEB_DOMAIN"
VERIFICATION_PROVIDER="stripe"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_IDENTITY_RESTRICTED_KEY="rk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_IDENTITY_RETURN_URL="https://YOUR_VERCEL_WEB_DOMAIN/verification"
AI_PROVIDER="xai"
XAI_API_KEY="xai_..."
XAI_MODEL="grok-4.3"
S3_ENDPOINT="https://ACCOUNT_ID.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_BUCKET="onlydihs-private"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
RAW_UPLOAD_RETENTION_HOURS=24
```

`STRIPE_IDENTITY_RESTRICTED_KEY` is supported and preferred if you create a restricted Stripe key for Identity. If it is blank, the API uses `STRIPE_SECRET_KEY`.

## Local Web Env

Use `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL="http://localhost:8080"
```

## Production Web Env

Set this on Vercel:

```bash
NEXT_PUBLIC_API_BASE_URL="https://YOUR_RAILWAY_OR_RENDER_API_DOMAIN"
```

## Local Development

```bash
pnpm install
pnpm --filter @onlydihs/api db:generate
pnpm --filter @onlydihs/api db:push
pnpm --filter @onlydihs/api seed
pnpm dev
```

Seeded verified account:

- Email: `verified@onlydihs.local`
- Password: `change-me-change-me`

## Production Deployment

1. Create a Supabase Postgres project and copy the production `DATABASE_URL`.
2. Create Redis on Railway, Render, or Upstash and copy `REDIS_URL`.
3. Create a private Cloudflare R2 bucket. Use the S3-compatible endpoint, region `auto`, bucket name, access key, and secret key.
4. Create Stripe Identity test-mode keys. Add the API webhook endpoint after the API URL exists.
5. Create an xAI API key.
6. Deploy the API first.
7. Run `pnpm --filter @onlydihs/api db:deploy` against the Supabase `DATABASE_URL`.
8. Deploy the web app after the API URL is known.
9. Add the Stripe webhook endpoint: `https://YOUR_API_DOMAIN/api/verification/stripe-webhook`.
10. Set `STRIPE_WEBHOOK_SECRET` from Stripe, redeploy the API, then test end to end.

## Railway API Settings

- Root directory: repo root.
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @onlydihs/api build && pnpm --filter @onlydihs/api db:deploy`
- Start command: `pnpm --filter @onlydihs/api start`
- Healthcheck path: `/healthz` or `/api/health`
- Env: use the Production API Env block above.

## Render API Settings

- Root directory: repo root.
- Runtime: Node.
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @onlydihs/api build && pnpm --filter @onlydihs/api db:deploy`
- Start command: `pnpm --filter @onlydihs/api start`
- Healthcheck path: `/healthz`
- Env: use the Production API Env block above.

## Vercel Web Settings

- Root directory: repo root.
- Framework preset: Next.js.
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @onlydihs/web build`
- Output directory: `apps/web/.next`
- Env: `NEXT_PUBLIC_API_BASE_URL`.

## End-to-End Staging Test

1. Visit the Vercel URL.
2. Create an account or login.
3. Start Stripe Identity verification in test mode and complete it with Stripe test documents.
4. Confirm `/verification` changes to verified.
5. Open `/analyzer`.
6. Select a JPEG or PNG, check all consent boxes, and upload.
7. Confirm the upload enters processing and completes.
8. Open the private result page.
9. Confirm the result is visible only while logged in as the owning user.
10. Export data from Settings.
11. Delete an individual analysis.
12. Use Delete Account/Data in staging and confirm the account session ends.

## Stripe Identity

Stripe webhooks must be forwarded to:

```bash
https://YOUR_API_DOMAIN/api/verification/stripe-webhook
```

The app does not store government ID images or DOB. DOB is used only transiently in the webhook handler to confirm whether the verified person is 18+.

## xAI/Grok Analyzer

When `AI_PROVIDER="xai"` and `XAI_API_KEY` is present, the API worker reads the private upload server-side, sends it to xAI as a base64 data URL, requests structured JSON, validates the response with Zod, and saves only the private result for the authenticated owner.

Analyzer responses must match:

```json
{
  "length_score": 0,
  "girth_score": 0,
  "skin_clarity_score": 0,
  "presentation_score": 0,
  "picture_quality_score": 0,
  "confidence_score": 0,
  "total_score": 0,
  "confidence_level": "low",
  "warnings": []
}
```

The analyzer must not claim exact real-world measurements unless a real calibration object or known reference scale is available.

## Compliance Notes

This is not launch-ready legal guidance. A real launch needs legal review, a real age verification provider, a real moderation provider, clear consent/deletion/retention/reporting policies, production secrets, secure storage configuration, and operational review.

Raw uploads should be retained for the shortest practical time unless legal counsel says otherwise. `RAW_UPLOAD_RETENTION_HOURS` controls the retention cleanup job.
