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
| 2 | EBS gp3, 20 GB | Root + data volume | |
| 3 | 2 GB swap file on the instance | Prevents the OOM killer from stopping PostgreSQL when Chromium spikes | Required — see §6 |
| 4 | S3 bucket, e.g. `morabu-dx-skillsheet` | Profile photos, generated PDFs, nightly DB dumps | Private, SSE-S3, versioning on |
| 5 | IAM instance role | S3 access + Bedrock access + SSM parameter read | No access keys in the app |
| 6 | Amazon SES (production access) + SMTP credentials | Sends the one-time login links | Verify the sending domain |
| 7 | Amazon Bedrock model access | The AI that rewrites English answers into Japanese | See §4 — needs an explicit model enable |
| 8 | ACM certificate for `dx.morabu.com` | HTTPS | Auto-renew |
| 9 | Route 53 (or existing DNS) record for `dx.morabu.com` | Points at the instance / ALB | You mentioned IT is handling this |
| 10 | SSM Parameter Store entries (SecureString) | Secrets: DB password, `AUTH_SECRET`, SES credentials | See §5 |
| 11 | Security group | 443 in from the internet (or from the ALB), 22 in from admin only, all out | App listens on 127.0.0.1:3000 only |
| 12 | CloudWatch alarm on disk and memory | Small instance; early warning | Optional but recommended |

Everything must stay inside AWS. The client specification states explicitly that no
data may be sent to external services, because the sheets contain names, dates of birth
and hometowns.

---

## 2. Compute and network

- **Instance:** `t3.medium`, Amazon Linux 2023 or Ubuntu 24.04, `ap-northeast-1`.
- **Ports:** the application binds to `127.0.0.1:3000`. Put either an ALB or a local
  nginx/Caddy in front to terminate TLS on 443. Nothing else should be exposed.
- **Docker:** install Docker and the compose plugin. The repository contains a
  `Dockerfile` and `docker-compose.prod.yml` that start the app and PostgreSQL together.
- **Time zone:** set the instance and the database to `Asia/Tokyo`.

## 3. Database

- **PostgreSQL 16**, initially on the same instance (the client asked for this to avoid
  additional cost now).
- The design keeps an RDS move cheap: the connection string is a single environment
  variable, so migration means changing `DATABASE_URL` and restoring a dump. Nothing
  else in the application changes.
- **Nightly dump to S3 is required from day one.** The client wants to be able to state
  that backups run automatically every day. A cron entry is enough:

```bash
# /etc/cron.d/skillsheet-backup
0 3 * * * root docker exec skillsheet-db pg_dump -U skillsheet skillsheet | gzip | \
  aws s3 cp - s3://morabu-dx-skillsheet/backups/$(date +\%Y\%m\%d).sql.gz
```

Set an S3 lifecycle rule to expire backups after, say, 90 days.

## 4. AI service (Amazon Bedrock)

The application calls an AI service to rewrite English answers into Japanese. Bedrock is
recommended because it runs inside AWS and does not use submitted data for training,
which is what the specification requires.

**What to do:**
1. In the Bedrock console (Tokyo region), request access to a model with good Japanese
   output. Tell us the resulting **model ID** — it goes into `AI_MODEL`.
2. Attach to the instance role:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:Converse"],
  "Resource": "arn:aws:bedrock:ap-northeast-1::foundation-model/*"
}
```

3. Confirm in writing that data submitted to the chosen model is not used for training —
   the client asks for this explicitly.

**Until this is ready**, the application runs with `AI_PROVIDER=mock`. Everything else —
import, editing, review, versioning, PDF output — works normally; only the generated
Japanese is placeholder text clearly marked as such. So this is not a blocker for
setting up the environment.

## 5. Secrets

Store these in SSM Parameter Store as `SecureString` under `/dx-skillsheet/` and load
them into the container environment at start-up. Do not put them in the repository.

| Parameter | Example / how to generate |
|---|---|
| `/dx-skillsheet/AUTH_SECRET` | `openssl rand -base64 48` |
| `/dx-skillsheet/POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `/dx-skillsheet/SMTP_USER` | SES SMTP username |
| `/dx-skillsheet/SMTP_PASSWORD` | SES SMTP password |

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
STORAGE_DRIVER=s3
S3_BUCKET=morabu-dx-skillsheet
S3_REGION=ap-northeast-1
AI_PROVIDER=bedrock                          # use "mock" until Bedrock is ready
AI_MODEL=<bedrock model id>
AI_REGION=ap-northeast-1
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

1. The **Bedrock model ID** once model access is granted (or tell us to stay on `mock`).
2. The **SES sending identity** and SMTP credentials, and whether SES is out of the
   sandbox in this account.
3. The **final routing structure** for `dx.morabu.com` you mentioned, so we can confirm
   `APP_URL` and the forwarded-header configuration.
4. Confirmation that **running the app, PostgreSQL and Chromium on one `t3.medium`** is
   acceptable to you. It fits the specification, but if you would rather split the
   database out to RDS now, the only change on our side is one environment variable.
