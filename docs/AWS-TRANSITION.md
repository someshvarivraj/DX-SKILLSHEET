# Trial → production AWS transition guide

**For:** the colleague who owns the AWS environment and the deployment
**Purpose:** move `dx-skillsheet` from the trial environment (dummy data, our
AWS account) to the production environment (real data, your AWS account,
`https://dx.morabu.com`)

This is the step-by-step path from where things stand today to where they need
to be. `docs/AWS-REQUIREMENTS.md` is the reference for *what* the production
environment needs; this document is the *how* — specifically, what changes
relative to the trial environment that is already running, and in what order.

---

## 1. Where things stand today (the trial environment)

Set up 2026-09-21, documented in `docs/DEPLOY-TRIAL.md`. None of this is
production-grade by design — it was built to be thrown away.

| Item | Trial | Production target |
|---|---|---|
| AWS account | Ours (`514917275273`) | Yours |
| Region | `us-east-1` | `ap-northeast-1` (Tokyo) — see §4 warning |
| Instance | EC2 `t3.small` | EC2 `t3.medium` (per spec sizing) |
| Domain / TLS | `https://3-94-22-106.sslip.io`, Caddy auto-HTTPS | `https://dx.morabu.com`, ACM cert |
| Auth | Shared demo password (`DEMO_ACCOUNT_EMAIL`, role `ADMIN`) | One-time email links only, demo account disabled |
| `MAIL_TRANSPORT` | `console` (no real email sent) | `smtp` via Amazon SES |
| `STORAGE_DRIVER` | `local` (container filesystem) | `s3` |
| `AI_PROVIDER` | `mock` (no generation, nothing leaves the box) | `bedrock` |
| Data | 5 dummy people from `data/sample-responses*.csv` | Real applicant data |
| CI/CD | GitHub Actions → OIDC → this AWS account → this one EC2 instance | Same workflow file, pointed at your account |

The important thing this table is built to show you: **the application code and
the deploy mechanism do not change.** Every row above is an environment
variable or an AWS-side resource, per `src/lib/env.ts` — "every deployment
difference between local and AWS lives here and nowhere else." Moving to
production is provisioning plus configuration, not a new build.

## 2. What you need to have ready before starting

From `docs/AWS-REQUIREMENTS.md` §10, restated as a checklist:

- [ ] AWS account you control, with permission to create IAM roles, EC2, S3,
      SES, Bedrock access, ACM certs, and (if you're handling DNS yourself)
      Route 53 records
- [ ] Decision: Bedrock model ID (Tokyo region) for `AI_MODEL`, or confirmation
      to launch with `AI_PROVIDER=mock` until it's granted
- [ ] SES sending identity for `morabu.com` verified, and confirmation of
      whether the account is out of the SES sandbox
- [ ] Confirmation of the final routing for `dx.morabu.com` (ALB vs. an nginx
      reverse proxy on the instance — both are documented, §9 of
      AWS-REQUIREMENTS.md)
- [ ] A GitHub account with admin access to `someshvarivraj/DX-SKILLSHEET` to
      set repository variables (§5 below)

## 3. Provision the AWS resources

Follow `docs/AWS-REQUIREMENTS.md` §1–§7 in your account: EC2 instance + swap,
EBS, S3 bucket, instance IAM role (S3 + Bedrock + SSM read), SES, Bedrock model
enablement, ACM cert, DNS record, SSM Parameter Store secrets, security group,
optional CloudWatch alarms. That document has the exact resource shapes and
IAM policy JSON already — nothing about that part is trial-specific, so there
is no shortcut from the trial setup to reuse there.

One trial detail worth copying deliberately: **the 2 GB swap file and
`shm_size: 512mb`** (already in `docker-compose.prod.yml`) were not
theoretical — the trial instance needed them. Don't skip either.

## 4. Set up CI/CD in your account

The deploy workflow itself (`.github/workflows/deploy.yml`) needs no code
changes — it reads the target account, bucket and instance entirely from three
GitHub repository variables. Follow `docs/ci-cd/README.md` steps 1–2.5 **in
your AWS account**:

1. Register GitHub as an OIDC identity provider (skip if this account already
   has one for any repo).
2. Create the deploy role using `docs/ci-cd/trust-policy.json` and
   `docs/ci-cd/deploy-permissions.json` as templates — **but edit both files
   first**:
   - `trust-policy.json` hard-codes our trial account ID (`514917275273`) in
     the `Federated` ARN. Replace it with yours.
   - `deploy-permissions.json` and `ec2-read-deploy-artifact-policy.json`
     hard-code the trial S3 bucket name and the trial instance ARN. Replace
     both with your bucket name and your instance's ARN once it exists.
3. Widen the EC2 instance's own role to read the deploy bucket
   (`ec2-read-deploy-artifact-policy.json`), against whatever you name that
   role in your account.

**Region mismatch to fix while you're in these files:** the trial instance and
role live in `us-east-1` — `deploy-permissions.json`'s resource ARNs say so,
and so does `aws-region: us-east-1` inside `deploy.yml`. That was never meant
to be the production region; `docs/AWS-REQUIREMENTS.md` specifies Tokyo
(`ap-northeast-1`) throughout, both for latency to the client and because the
Bedrock model access has to be requested in that region. If your instance goes
up in `ap-northeast-1` (it should), update:

- The instance/role ARNs in the policy JSON (region segment)
- `aws-region: us-east-1` → `aws-region: ap-northeast-1` in
  `.github/workflows/deploy.yml`

That line is the one piece of the workflow that *does* need a code change —
everything else is the three repository variables below.

## 5. Point GitHub at the new account

Repo → **Settings → Secrets and variables → Actions → Variables**. Replace the
three trial values:

| Variable | Trial value | Set to |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | role in account `514917275273` | the role ARN from §4.2, your account |
| `DEPLOY_BUCKET` | `dx-skillsheet-deploy-514917275273` | your deploy bucket name |
| `DEPLOY_INSTANCE_ID` | `i-0521602aa68362440` | your new EC2 instance ID |

No GitHub Secrets are used anywhere in this workflow (OIDC issues temporary
credentials per run) — only Variables. Nothing else in GitHub changes.

## 6. Build the production `.env.production`

Start from `.env.production.example` in the repo root, not from the trial
`.env`/`.env.production` — the trial file has trial-only settings that must
**not** carry over. Fill the placeholders from SSM Parameter Store as you
create them (§5 of AWS-REQUIREMENTS.md: `AUTH_SECRET`,
`POSTGRES_PASSWORD`, `SMTP_USER`, `SMTP_PASSWORD`).

Differences from the trial environment to get right, checked against
`src/lib/env.ts`:

```bash
APP_URL=https://dx.morabu.com          # was the sslip.io address
NODE_ENV=production

MAIL_TRANSPORT=smtp                    # was: console
SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
SMTP_USER=<SES SMTP username>
SMTP_PASSWORD=<SES SMTP password>
MAIL_FROM=skillsheet@morabu.com        # must be the verified SES identity

STORAGE_DRIVER=s3                      # was: local
S3_BUCKET=<your bucket>
S3_REGION=ap-northeast-1
# leave S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY unset — the instance role covers it

AI_PROVIDER=bedrock                    # was: mock — or leave as mock if Bedrock isn't ready yet
AI_MODEL=<bedrock model id>
AI_REGION=ap-northeast-1

# Demo account: leave both blank and NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED=false.
# This is a real-data environment; the shared-password demo account from the
# trial must not exist here (see the DEPLOY-TRIAL.md decommission notes, §7 below).
DEMO_ACCOUNT_EMAIL=
DEMO_ACCOUNT_PASSWORD=
NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED=false
```

`AUTH_ALLOWED_EMAIL_DOMAINS=morabu.com` is already correct and doesn't need to
change from the trial value.

## 7. First deploy (manual — CI/CD takes over after)

This is `docs/AWS-REQUIREMENTS.md` §8, run once by hand so the database exists
before the automated pipeline has anything to redeploy onto:

```bash
git clone <repo> /opt/dx-skillsheet && cd /opt/dx-skillsheet
cp .env.production.example .env.production      # fill in from Parameter Store, per §6 above
docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

**Do not run `npm run db:demo`.** That command loads the trial's dummy
applicants (`data/sample-responses*.csv`) through the real import path — it
was for the trial only. Production starts from an empty `FormResponse` table
and real applicants get imported through the app's own import screen.

Set up the nightly backup cron from AWS-REQUIREMENTS.md §3 at this point too —
it's not part of `docker-compose.prod.yml` and won't exist unless you add it.

After this first deploy, subsequent ones are a `git push` to `main`: GitHub
Actions packages the source, uploads it to your S3 bucket, and rebuilds the
container on the instance via SSM. **Database migrations are not part of that
workflow** — if a change includes a Prisma migration, run
`docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy`
by hand after that deploy, same as during the trial.

## 8. Verify before handing off

- `GET https://dx.morabu.com/api/health` → `200`, and the body's `checks`
  show `ai: provider=bedrock` (or `mock` if deliberately deferred),
  `storage: driver=s3`, `mail: transport=smtp`, `database: ok=true`
- Send yourself a real login link and confirm it arrives via SES (not just
  logged to the console, which is all the trial ever did)
- Import one real record and confirm the photo/PDF round-trip through S3
- Generate a PDF and confirm Japanese text renders (the `fonts-noto-cjk`
  package is already in the Docker image, but worth checking once on real
  infrastructure)
- Confirm the nightly `pg_dump → S3` cron entry is present and points at your
  bucket

## 9. Decommission the trial

- Disable or delete the trial's `trial@morabu.com` demo account, or at least
  drop its role from `ADMIN` back to `VIEWER` (`docs/DEPLOY-TRIAL.md` §5)
- Delete the 5 dummy people from the trial instance
- Terminate the trial EC2 instance and its resources once you're confident in
  production, or keep it around as a staging box — your call; nothing in the
  application assumes it still exists
- The trial's IAM deploy role and S3 deploy bucket in account `514917275273`
  can be deleted once `DEPLOY_INSTANCE_ID` in GitHub no longer points at them
