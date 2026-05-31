# OnlyDihs Phase 1 Private Analyzer

OnlyDihs Phase 1 is a private adult-only image analyzer MVP. It does not include livestreaming, public sharing, user matching, comments, DMs, public galleries, public profiles, leaderboards, battle mode, or sharing links.

The safety model is intentionally strict:

- Verified adults only.
- Private upload only.
- Private score only.
- No anonymous or unverified uploads.
- Every upload requires an explicit consent event.
- Raw uploads use private S3-compatible storage and short-lived presigned PUT URLs.
- Analyzer output is a private visual estimate, not a medical result or exact measurement.

## Apps

- `apps/web`: Next.js App Router UI with Tailwind.
- `apps/api`: Express API with Prisma, PostgreSQL, Redis/BullMQ, S3-compatible storage, cookie sessions, Zod validation, rate limits, audit logs, and private ownership checks.
- `apps/ai-service`: optional FastAPI analyzer service with the same Phase 1 structured JSON contract; the API currently uses an internal placeholder worker.

## Environment

Copy `.env.example` and set real values:

```bash
DATABASE_URL=
REDIS_URL=
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
SESSION_SECRET=
VERIFICATION_PROVIDER_API_KEY=
VERIFICATION_WEBHOOK_SECRET=
APP_BASE_URL=
RAW_UPLOAD_RETENTION_HOURS=24
NEXT_PUBLIC_API_BASE_URL=
```

## Local Development

```bash
pnpm install
pnpm --filter @onlydihs/api prisma:generate
pnpm --filter @onlydihs/api prisma:push
pnpm --filter @onlydihs/api seed
pnpm dev
```

Seeded verified account:

- Email: `verified@onlydihs.local`
- Password: `change-me-change-me`

## Verification Placeholder

`POST /api/verification/start` creates a placeholder verification session. A real provider should replace this before launch. To simulate provider completion in development, call:

```bash
curl -X POST http://localhost:8080/api/verification/webhook \
  -H "Content-Type: application/json" \
  -H "x-verification-signature: replace-with-webhook-secret" \
  -d '{"providerVerificationId":"SESSION_ID","status":"verified","ageOver18Confirmed":true}'
```

Uploads remain blocked unless the latest verification status is `verified` and `ageOver18Confirmed` is true.

## Analyzer Contract

Analyzer responses must be structured JSON only:

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

`total_score` uses the Phase 1 weights: length 35%, girth 30%, skin clarity 15%, presentation 10%, picture quality 5%, and confidence/calibration quality 5%. The service must not claim exact measurements unless a real calibration object or known reference scale is available.

## Compliance Notes

This is not launch-ready legal guidance. A real launch needs legal review, a real age verification provider, a real moderation provider, clear consent/deletion/retention/reporting policies, production secrets, secure storage configuration, and operational review.

Raw uploads should be retained for the shortest practical time unless legal counsel says otherwise. `RAW_UPLOAD_RETENTION_HOURS` controls the retention cleanup job.
