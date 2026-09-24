# AWS requirements — DX Skill Sheet application

**For:** the colleague who owns the AWS environment and the deployment
**Application:** `dx-skillsheet` (Next.js 15 + PostgreSQL + headless Chromium)
**Target URL:** `https://dx.morabu.com` (subdomain already planned for the DX AWS environment)

This document lists exactly what needs to exist in AWS, what the application expects as
environment variables, and how to deploy it. Nothing in the application code is
AWS-specific except through these variables, so the same build runs locally and in AWS.

---

## 1. Summary of what to create

| # | Resource | Purpose | Notes |
|---|---|---|---|
| 1 | EC2 instance, `t3.medium` (2 vCPU / 4 GiB), Tokyo `ap-northeast-1` | Runs the app, PostgreSQL and Chromium | Sized per the client specification |
| 2 | EBS gp3, **≥30 GB** (was 20 GB) | Root + data volume | Not optional — this is the instance's own disk, every EC2 instance needs one. Bumped from the original 20GB because §2a below now puts photos, PDFs *and* DB backups on it too, where the original plan put those on S3 |
| 3 | 2 GB swap file on the instance | Prevents the OOM killer from stopping PostgreSQL when Chromium spikes | Required — see §6. Free (a file on the EBS volume above, not a billed AWS resource) — there's no cost saving in skipping it, only crash risk |
| 4 | ~~S3 bucket~~ — **deferred, see §2a** | Was: profile photos, generated PDFs, nightly DB dumps | **Not being created for now** — decision 2026-09-24, see §2a. Everything that was going to live in S3 lives on the EBS volume (row 2) instead, until this is revisited |
| 5 | IAM instance role | SSM parameter read only | No S3 permission needed while storage is local; no access keys in the app either way; see §4 — the AI provider now used needs no AWS permission at all |
| 6 | Amazon SES (production access) + SMTP credentials | Sends the one-time login links | Verify the sending domain |
| 7 | Google AI (Gemini) API key | The AI that rewrites English answers into Japanese | See §4 — **decision changed 2026-09-24: away from Bedrock, see the warning below** |
| 8 | ACM certificate for `dx.morabu.com` | HTTPS | Auto-renew |
| 9 | Route 53 (or existing DNS) record for `dx.morabu.com` | Points at the instance / ALB | You mentioned IT is handling this |
| 10 | SSM Parameter Store entries (SecureString) | Secrets: DB password, `AUTH_SECRET`, SES credentials, Gemini API key | See §5 |
| 11 | Security group | 443 in from the internet (or from the ALB), 22 in from admin only, all out | App listens on 127.0.0.1:3000 only |
| 12 | CloudWatch alarm on disk and memory | Small instance; early warning | Optional but recommended |

**Everything else must stay inside AWS.** The client specification states explicitly
that no data may be sent to external services, because the sheets contain names, dates
of birth and hometowns — this is why Bedrock was the original choice. Using the Google
AI (Gemini) API instead means the English answers that get rewritten into Japanese leave
AWS and go to Google's servers for that one call. **See the warning in §4 — this needs
the client's explicit sign-off before it touches real applicant data, the same way the
Groq option in the trial environment does.**

---

## 2. Compute and network

- **Instance:** `t3.medium`, Amazon Linux 2023 or Ubuntu 24.04, `ap-northeast-1`.
- **Ports:** the application binds to `127.0.0.1:3000`. Put either an ALB or a local
  nginx/Caddy in front to terminate TLS on 443. Nothing else should be exposed.
- **Docker:** install Docker and the compose plugin. The repository contains a
  `Dockerfile` and `docker-compose.prod.yml` that start the app and PostgreSQL together.
- **Time zone:** set the instance and the database to `Asia/Tokyo`.

## 2a. Storage — deferred from S3 to local disk (decision 2026-09-24)

**No S3 bucket for now.** `STORAGE_DRIVER=local` (already the trial's setting — this
is not new code, just staying on the default the app already ships with) writes photos
and generated PDFs to a folder on the instance's own EBS volume instead. Nothing in the
application changes to support this; `STORAGE_DRIVER=s3` is a config flip whenever S3
gets added later, per `src/lib/storage.ts`.

**What this trades away, so it's a real decision and not a free lunch:**
- Files live only on this one instance's disk. If the instance or its volume is lost,
  photos, PDFs *and* the nightly database backup (see below) go with it — there is no
  off-instance copy. Take an EBS snapshot on a schedule if you want any recovery story
  at all before S3 is added.
- Disk usage grows over time instead of staying flat — see the EBS sizing note in §1.
- The `client_max_body_size` / disk-full failure mode is now something to actually
  monitor (a CloudWatch disk alarm, §1 row 12, matters more here than it would with S3).

Adding S3 later is small and non-disruptive: create the bucket, set `STORAGE_DRIVER=s3`
+ `S3_BUCKET` + `S3_REGION`, copy the existing files up, restart the app. Nothing about
running this way now blocks that later — this is explicitly an interim choice, not a
redesign.

## 3. Database

- **PostgreSQL 16**, initially on the same instance (the client asked for this to avoid
  additional cost now).
- The design keeps an RDS move cheap: the connection string is a single environment
  variable, so migration means changing `DATABASE_URL` and restoring a dump. Nothing
  else in the application changes. (Photos/PDFs are a separate concern from the
  database — see §2a; RDS would only ever hold the structured data, never the binary
  files, the storage driver never targets RDS.)
- **Nightly dump — required from day one, currently to local disk instead of S3 (see
  §2a).** The client wants to be able to state that backups run automatically every
  day; that requirement doesn't go away just because S3 isn't set up yet, but the
  destination does, for now:

```bash
# /etc/cron.d/skillsheet-backup
# Interim: local disk (see §2a). Swap the last line for an `aws s3 cp` once a
# bucket exists — the pg_dump/gzip part doesn't change.
0 3 * * * root docker exec skillsheet-db pg_dump -U skillsheet skillsheet | gzip > \
  /var/backups/skillsheet/$(date +\%Y\%m\%d).sql.gz
find /var/backups/skillsheet -mtime +90 -delete
```

This is weaker than the original S3 plan — a backup sitting on the same disk as the
database it's backing up doesn't protect against losing the whole instance or volume,
only against a bad migration or accidental deletion. Worth an EBS snapshot schedule
in the meantime, and worth moving to S3 sooner rather than later given this now holds
real applicant data. Once a bucket exists, swap the last line for the original
`aws s3 cp - s3://.../backups/...` and set an S3 lifecycle rule to expire at 90 days.

## 4. AI service (Google AI / Gemini API)

The application calls an AI service to rewrite English answers into Japanese.

**⚠ Decision change, 2026-09-24: away from Bedrock, to the Google AI (Gemini)
API.** Bedrock was originally chosen specifically *because* it runs inside AWS and
keeps data off external services, per spec §3 ("all processing must be completed
inside AWS; do not send data to external services") and §13. The Google AI Gemini
Developer API (`generativelanguage.googleapis.com`) is a public, multi-tenant Google
endpoint reached over the internet with an API key — it is not inside AWS, and it is
the same category of service as the Groq option already flagged in
`docs/DEPLOY-TRIAL.md` as **trial/dummy-data only, never with real applicant data**,
for exactly this reason.

This is not a technical blocker — the application's AI provider is a pluggable
interface (`src/lib/ai/provider.ts`) built precisely so the vendor can change without
touching code, and Gemini's OpenAI-compatible endpoint slots into the existing
`AI_PROVIDER=openai-compatible` path unchanged. It **is** a policy question: whether
sending applicant answers (names are filtered out — see `FIELDS_NEVER_SENT_TO_AI` in
`src/lib/ai/provider.ts` — but hometowns, education and work history are not) to
Google's servers is acceptable under what was told to 佐野様/the client. **Get that
confirmed in writing before this runs against real data.** If it is not acceptable,
the Bedrock path is still fully implemented (`src/lib/ai/bedrock.ts`) and can be
switched back to by changing `AI_PROVIDER` alone.

**What to do, once approved:**
1. In [Google AI Studio](https://aistudio.google.com/), create an API key under the
   Google Cloud project you want billed. Tell us the key (via Parameter Store, not
   chat/email — see §5) and which model you want (e.g. a current `gemini-*-flash`
   model for cost, or a `-pro` model for quality — check AI Studio for the current
   list, model names move quickly).
2. No IAM change is needed — the key is an application-level secret like the SES
   password, not an AWS instance-role permission. This also means, unlike Bedrock,
   there is nothing to request access to per-region; the Tokyo requirement for this
   environment (EC2, SES) is unaffected and still stands.
3. Set in the environment (see §7):
   ```bash
   AI_PROVIDER=openai-compatible
   AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   AI_API_KEY=<Gemini API key, from Parameter Store>
   AI_MODEL=<model name from AI Studio>
   ```
4. Confirm Google's current data-use terms for this API (whether prompts/responses
   are used to improve their models) and pass that confirmation along — the same
   ask the client made for Bedrock in §13 of the spec.

**Until this is decided**, the application runs with `AI_PROVIDER=mock`. Everything
else — import, editing, review, versioning, PDF output — works normally; only the
generated Japanese is placeholder text clearly marked as such. So this is not a
blocker for setting up the rest of the environment.

## 5. Secrets

Store these in SSM Parameter Store as `SecureString` under `/dx-skillsheet/` and load
them into the container environment at start-up. Do not put them in the repository.

| Parameter | Example / how to generate |
|---|---|
| `/dx-skillsheet/AUTH_SECRET` | `openssl rand -base64 48` |
| `/dx-skillsheet/POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `/dx-skillsheet/SMTP_USER` | SES SMTP username |
| `/dx-skillsheet/SMTP_PASSWORD` | SES SMTP password |
| `/dx-skillsheet/AI_API_KEY` | Gemini API key from Google AI Studio |

Instance role needs `ssm:GetParameter*` and `kms:Decrypt` for that path.

## 6. Settings that matter on a small instance

The specification calls these out and they are real; please do not skip them.

| Setting | Why |
|---|---|
| **2 GB swap** | `t3.medium` has no swap by default. When memory runs out the OOM killer stops PostgreSQL or the app and the whole system goes down. |
| **`shm_size: 512mb` for the app container** | Docker's default 64 MB shared memory makes Chromium fail to start, even when free memory is plentiful. Already set in `docker-compose.prod.yml`. |
| **One PDF at a time** | Enforced in the application (`PDF_MAX_CONCURRENCY=1`). Bulk exports are processed sequentially. |
| **Japanese font on the instance** | The Docker image installs `fonts-noto-cjk`. If you run the app outside Docker, install it on the host or the PDF will show boxes instead of Japanese. |

## 7. Environment variables the application expects

Copy `.env.production.example` to `.env.production` and fill it in. Full list with
explanations is in that file; the ones that need your input:

```bash
APP_URL=https://dx.morabu.com
DATABASE_URL=postgresql://skillsheet:<password>@127.0.0.1:5432/skillsheet?schema=public
AUTH_SECRET=<from parameter store>
AUTH_ALLOWED_EMAIL_DOMAINS=morabu.com        # only these may sign in
MAIL_TRANSPORT=smtp
SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<SES SMTP username>
SMTP_PASSWORD=<SES SMTP password>
MAIL_FROM=skillsheet@morabu.com              # must be a verified SES identity
STORAGE_DRIVER=local                         # was s3 — deferred, see §2a
STORAGE_LOCAL_PATH=./storage                 # = /app/storage in the container; mounted from
                                              # the host at /var/lib/skillsheet/storage,
                                              # see docker-compose.prod.yml — do not change
                                              # this without updating that mount too
AI_PROVIDER=openai-compatible                # use "mock" until the AI decision (see §4) is final
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<gemini api key>                  # from Parameter Store
AI_MODEL=<gemini model name>                 # check current model list in AI Studio
CHROMIUM_PATH=/usr/bin/chromium
```

## 8. Deployment

```bash
git clone <repo> /opt/dx-skillsheet && cd /opt/dx-skillsheet
cp .env.production.example .env.production      # then fill in from Parameter Store
docker compose -f docker-compose.prod.yml up -d --build

# first deploy only: create the schema and load the initial configuration
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

Subsequent deployments:

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

**Health check:** `GET https://dx.morabu.com/api/health` returns HTTP 200 with a JSON
body reporting the database, AI provider, storage and mail configuration. Use it for the
load balancer and for any monitoring.

## 9. Reverse proxy notes

If you terminate TLS with nginx on the instance:

```nginx
server {
  listen 443 ssl http2;
  server_name dx.morabu.com;
  client_max_body_size 20m;          # response file uploads and photos

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;         # PDF generation can take a while
  }
}
```

`X-Forwarded-For` matters: the audit log records the client IP from it.

## 10. What we still need from you

1. **Written confirmation that sending applicant answers to Google's Gemini API is
   acceptable** under what's been told to the client (see the §4 warning) — this is
   the one open item that changed with the move away from Bedrock. Once that's
   settled: the **Gemini API key and model name** (or tell us to stay on `mock`).
2. The **SES sending identity** and SMTP credentials, and whether SES is out of the
   sandbox in this account.
3. The **final routing structure** for `dx.morabu.com` you mentioned, so we can confirm
   `APP_URL` and the forwarded-header configuration.
4. Confirmation that **running the app, PostgreSQL and Chromium on one `t3.medium`** is
   acceptable to you. It fits the specification, but if you would rather split the
   database out to RDS now, the only change on our side is one environment variable.
5. Nothing needed from you on S3 right now — that's deferred to local disk storage
   (§2a), decided 2026-09-24. Flagging so it isn't assumed forgotten: it's an
   intentional interim choice, revisit it once this environment is stable.
