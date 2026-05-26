# SizeAI

SizeAI is a production-oriented creator subscription MVP with a private, entertainment-only AI analyzer for consenting adults (18+). Uploads are stored privately (signed URLs only) and never publicly exposed. The analyzer produces a humorous, confidence-oriented report; it does not provide medical advice or claim clinical accuracy.

## Repo structure
- `apps/web`: Next.js 15 (App Router), Tailwind, shadcn-inspired UI primitives, Framer Motion
- `apps/api`: Express API (JWT auth via Supabase, Prisma ORM, Stripe webhooks, R2 signing, chat + SSE, moderation)
- `apps/ai-service`: FastAPI microservice (OpenCV-based heuristic scoring; lightweight local inference)
- `packages/ui`: shared UI primitives (glass/gradient/radar SVG helpers)
- `packages/types`: shared API type exports (currently minimal)

## Quick local setup

### 1) Copy env file
Copy `.env.example` to `.env` (or set equivalent environment variables in your shell).

### 2) Start Postgres + Redis
```bash
docker compose up -d postgres redis
```

### 3) Install dependencies
This repo is set up for `pnpm` workspaces.
```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
```

### 4) Create DB schema + seed data
```bash
pnpm --filter @sizeai/api prisma:push
pnpm --filter @sizeai/api seed
```

Seed users:
- Admin: `admin@sizeai.local` (handle: `admin`)
- Creator: `creator@sizeai.local` (handle: `compact-king`)
- Fan: `fan@sizeai.local` (handle: `fanboy`)

### 5) Run services
FastAPI:
```bash
cd apps/ai-service
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

API:
```bash
pnpm --filter @sizeai/api dev
```

Web:
```bash
pnpm --filter @sizeai/web dev
```

## Deployment notes (MVP)

### Web (Vercel)
- Deploy `apps/web`
- Set required `NEXT_PUBLIC_*` env vars (see `.env.example`)
- Ensure your `NEXT_PUBLIC_API_BASE_URL` points to the deployed `apps/api`
- Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for chat unlock payments

### API (Render/Fly/Railway/etc.)
- Deploy `apps/api`
- Ensure the API URL is reachable publicly so Stripe can call the webhook endpoint
- Set env vars from `.env.example` for the API container/runtime

### AI service (Render/Fly/etc.)
- Deploy `apps/ai-service`
- Set `AI_SERVICE_URL` in the API to point to it (example: `http://your-ai-host:8000`)

## Stripe setup (keys + webhook)

1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/).
2. Create/verify your Stripe account (test mode first).
3. Get your API secret key:
   - Click `Developers` (left sidebar) -> `API keys`
   - Under `Standard keys`, copy `Secret key` and paste into `STRIPE_SECRET_KEY` in your `.env`.
4. Enable Stripe Connect:
   - Click `Settings` -> `Account` (or `Connect settings` if shown)
   - Ensure Connect is enabled for Express accounts.
5. Configure webhook endpoint:
   - Click `Developers` -> `Webhooks`
   - Click `Add endpoint`
   - `Endpoint URL`: put your deployed API URL + `/stripe/webhook`
     - Example: `https://your-api-host.com/stripe/webhook`
   - `Events to send`: add at least:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `payment_intent.succeeded`
   - Click `Add endpoint`
6. Copy the webhook signing secret:
   - Open the created webhook endpoint
   - Copy `Signing secret` -> paste into `STRIPE_WEBHOOK_SECRET` in your `.env`.

## Supabase setup (auth keys + redirects)

1. Create a Supabase project:
   - Go to [Supabase](https://supabase.com/) -> `New project`
2. Copy `Project URL`:
   - In Supabase Dashboard: `Project Settings` -> `API`
   - Copy `Project URL` -> paste into `NEXT_PUBLIC_SUPABASE_URL` (web `.env`) and `SUPABASE_URL` (api `.env`).
3. Copy anon key:
   - Supabase Dashboard -> `Project Settings` -> `API`
   - Copy `anon public key` -> paste into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Copy service role key (for API verification/admin):
   - Supabase Dashboard -> `Project Settings` -> `API`
   - Copy `service role key` -> paste into `SUPABASE_SERVICE_ROLE_KEY` (api `.env`).
5. Configure auth redirect URLs (magic link):
   - Supabase Dashboard -> `Authentication` -> `URL Configuration`
   - Add your app domain(s) to allowed redirects (Vercel domain + local).
   - Ensure your magic link redirect target matches `window.location.origin` used in `AdultGate`.

## Cloudflare R2 setup (private bucket + S3-compatible credentials)

1. In [Cloudflare Dashboard](https://dash.cloudflare.com/):
   - Go to `R2` -> `Create Bucket`
   - Choose a bucket name (example: `sizeai-private`)
2. Create an API token with R2 permissions:
   - Go to `Workers & Pages` -> `API Tokens` (or `My API tokens`)
   - Click `Create Token`
   - Choose template that includes R2 read/write (bucket-scoped)
   - Scope it to your R2 bucket
   - Copy:
     - Account ID (`R2_ACCOUNT_ID`)
     - Access key ID (`R2_ACCESS_KEY_ID`)
     - Secret (`R2_SECRET_ACCESS_KEY`)
3. Paste into:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`

## Redis setup (caching + SSE pub/sub)

1. Choose a provider (example: Upstash).
2. Create a Redis database.
3. In the Redis provider dashboard, find your connection string:
   - Example looks like: `redis://default:password@host:port`
4. Paste it into `REDIS_URL` in `apps/api` env.

If Redis is not configured, the app falls back to a local in-memory pub/sub for development (still functional, but less robust for production).

## Postgres setup

Local:
- Docker compose starts Postgres at `localhost:5432` (see `docker-compose.yml`)

Production:
- Use a managed Postgres (Supabase/Neon/Railway/etc.)
- Paste the connection string into `DATABASE_URL` for `apps/api`.

## HuggingFace token (optional)

The current MVP uses OpenCV heuristics in the AI service, so HF token is optional.

For future ONNX/model downloading:
1. Go to [Hugging Face](https://huggingface.co/)
2. Open `Settings` -> `Access Tokens`
3. Create a token with `read` access to the model(s)
4. Paste into `HF_TOKEN` for `apps/ai-service`.

## Optional: Clerk auth (not used by default)

This MVP uses Supabase Auth by default. If you want to switch to Clerk:
- Replace the `apps/web` login/session wiring and the `apps/api` JWT verification layer.
- Then set the following Clerk env vars in both web + api:
  - `CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`

Step-by-step Clerk keys:
1. Go to [Clerk](https://dashboard.clerk.com/) and log in.
2. Create an application: click `Create` (or `New`).
3. After creation, open your app dashboard.
4. Find API keys:
   - Click `Settings` -> `API Keys`
   - Copy `Publishable key` and paste it into `CLERK_PUBLISHABLE_KEY` in your `.env`.
   - Copy `Secret key` and paste it into `CLERK_SECRET_KEY` in your `.env`.
5. Configure redirect URLs:
   - In the same app dashboard, click `Domains` or `Appearance/Sign-in` (wording can vary)
   - Add your Vercel domain and local `http://localhost:3000` for redirects.

## Environment variables (canonical list)

See `.env.example` for the complete list used by this codebase.

## Troubleshooting: npm / pnpm cannot reach the registry

If `npm ping` or `pnpm install` fails with `ECONNRESET` or TLS errors when contacting `registry.npmjs.org`, the SizeAI codebase is fine; your machine cannot complete HTTPS to the npm registry.

Try, in order:

1. Confirm general internet access and retry on a stable network (VPN off, or try a different VPN/server).
2. Corporate proxy: set npm proxy settings (`npm config set proxy` / `https-proxy`) or use your IT-provided registry mirror.
3. Flush DNS / disable aggressive firewall or antivirus HTTPS inspection temporarily.
4. Use an alternate registry mirror (example): `npm config set registry https://registry.npmmirror.com` then reinstall; switch back when stable.
5. Install on another machine or use CI/Vercel builds where registry access is reliable.

`corepack prepare pnpm` can also fail with the same network issue; fix connectivity first, then run `pnpm install` from the repo root.

## Next steps (recommended)
- Add full scheduled posts/stories/highlights UI
- Expand moderation with CSAM pipeline worker (placeholder hooks are present)
- Add rate limiting + idempotency for uploads/payments (structure is ready)
