# Trial → production AWS transition guide

**For:** the colleague who owns the AWS environment and the deployment
**Purpose:** move `dx-skillsheet` from the trial environment (dummy data, our
AWS account) to the production environment (real data, your AWS account,
`https://dx.morabu.com`)

**Just want the commands?** `docs/DEPLOY-COMPANY-AWS.md` is the hands-on runbook
for this move, every command in order. It assumes the app goes onto the
company's **existing** EC2 instance alongside what already runs there (a
dedicated new instance is covered in its appendix). This document explains the
why, and was written assuming a new dedicated instance.

This is the step-by-step path from where things stand today to where they need
to be. `docs/AWS-REQUIREMENTS.md` is the reference for *what* the production
environment needs; this document is the *how* — specifically, what changes
relative to the trial environment that is already running, and in what order.

**This whole build happens in a separate AWS account and does not touch the
trial.** Everything in §3 onward stands up new, independent resources in your
account. The trial keeps running on its own account exactly as it is —
nothing here stops it, changes it, or shares any resource with it — until
§9 (decommission), which is written as an optional last step you do on your
own schedule once you're confident in production, not something this
transition requires.

---

## 1. Where things stand today (the trial environment)

Set up 2026-09-21, documented in `docs/DEPLOY-TRIAL.md`. None of this is
production-grade by design — it was built to be thrown away.

| Item | Trial | Production target |
|---|---|---|
| AWS account | Ours (`514917275273`) | Yours |
| Region | `us-east-1` | `ap-northeast-1` (Tokyo) — see §3b warning |
| Instance | EC2 `t3.small` | EC2 `t3.medium` (per spec sizing) |
| Domain / TLS | `https://3-94-22-106.sslip.io`, Caddy auto-HTTPS | `https://dx.morabu.com` — Caddy auto-HTTPS again, or ALB + ACM cert |
| Auth | Shared demo password (`DEMO_ACCOUNT_EMAIL`, role `ADMIN`) | One-time email links only, demo account disabled |
| `MAIL_TRANSPORT` | `console` (no real email sent) | `smtp` via Amazon SES |
| `STORAGE_DRIVER` | `local` (EBS volume) | `local` too, for now — see §3a. No S3 in either environment yet |
| `AI_PROVIDER` | `mock` (no generation, nothing leaves the box) | `openai-compatible` → Google AI (Gemini) — see §3b warning |
| Data | 5 dummy people from `data/sample-responses*.csv` | Real applicant data |
| CI/CD | GitHub Actions → OIDC → this AWS account → this one EC2 instance | Same workflow file, pointed at your account |

The important thing this table is built to show you: **the application code and
the deploy mechanism do not change.** Every row above is an environment
variable or an AWS-side resource, per `src/lib/env.ts` — "every deployment
difference between local and AWS lives here and nowhere else." Moving to
production is provisioning plus configuration, not a new build.

## 2. What you need to have ready before starting

From `docs/AWS-REQUIREMENTS.md` §10, restated as a checklist:

- [ ] AWS account you control, with permission to create IAM roles, EC2, SES,
      ACM certs, and (if you're handling DNS yourself) Route 53 records — no
      S3 is needed anywhere in this setup (see §3a)
- [ ] **Written sign-off that sending applicant answers to Google's Gemini API
      is acceptable** (see §3b) — this replaced Bedrock on 2026-09-24
- [ ] Once that's settled: a Gemini API key and model name for `AI_MODEL`, or
      confirmation to launch with `AI_PROVIDER=mock` until it is
- [ ] SES sending identity for `morabu.com` verified, and confirmation of
      whether the account is out of the SES sandbox
- [ ] Confirmation of the final routing for `dx.morabu.com` (ALB vs. an nginx
      reverse proxy on the instance — both are documented, §9 of
      AWS-REQUIREMENTS.md)
- [ ] A GitHub account with admin access to `someshvarivraj/DX-SKILLSHEET` to
      set repository variables (§5 below)

## 3. Provision the AWS resources

Follow `docs/AWS-REQUIREMENTS.md` §1–§7 in your account: EC2 instance + swap,
EBS (sized ≥30GB now — see §3a), instance IAM role (`AmazonSSMManagedInstanceCore` + Parameter Store
read — no S3, no Bedrock permission needed, see §3a and §3b), SES, TLS
(Caddy on the instance, or ACM on an ALB), DNS record, SSM
Parameter Store secrets, security group, optional CloudWatch alarms. That
document has the exact resource shapes and IAM policy JSON already — nothing
about that part is trial-specific, so there is no shortcut from the trial
setup to reuse there.

**The EBS volume and the swap file are not optional line items to trim —
here's why, since it's a fair question to ask about anything with "extra"
in front of it:**
- **EBS** is the instance's own disk. Every EC2 instance has one; there's no
  version of "no EBS." The only real lever is size, and §3a below is the
  reason it went from the original 20GB to ≥30GB recommended now — it holds
  the database, and now photos/PDFs/backups too (see §3a).
- **Swap** costs nothing extra — it's a file on that same EBS volume, not a
  separate billed AWS service. There's no cost saved by skipping it, only
  crash risk taken on: `t3.medium` ships with no swap, and the trial hit
  exactly the failure mode this prevents (PostgreSQL getting OOM-killed when
  Chromium spikes memory during a PDF export). Keep it.

### 3a. No S3 for app storage, for now — decision 2026-09-24

**Photos and PDFs go on the EC2 instance's own disk (`STORAGE_DRIVER=local`),
not S3.** This is not new engineering — it's the exact setting the trial
already runs with (`docs/DEPLOY-TRIAL.md`), so production starts out
identical to the trial on this one axis, and picking up S3 later is a config
change (`STORAGE_DRIVER=s3` + a bucket), not a rebuild — see
`src/lib/storage.ts`.

**Two things worth knowing before treating this as free, though:**
1. **`docker-compose.prod.yml` needed a fix for this to actually persist.**
   The `app` service had no volume for `./storage` (`/app/storage` inside the
   container) — every CI/CD redeploy rebuilds that container, which would
   have silently deleted every uploaded photo and generated PDF on the next
   `git push`. Fixed: it now mounts
   `/var/lib/skillsheet/storage:/app/storage`. This bug existed in the trial
   too, not just here — worth knowing if any trial photos have gone missing
   after a deploy.
2. **No off-instance copy of anything.** Photos, PDFs, *and* the nightly
   database backup (`docs/AWS-REQUIREMENTS.md` §3) all end up on this one
   EBS volume. Lose the instance or the volume, lose all three at once —
   there's no S3 copy to fall back on. An EBS snapshot schedule is the cheap
   mitigation until S3 gets added; this matters more here than it did for
   the trial's dummy data, since this environment holds real applicants.

This is explicitly reversible and not a blocker — it only affects
`STORAGE_DRIVER` env var and one `docker-compose.prod.yml` volume line, and
nothing else in the app needs to change to add S3 later.

### 3b. AI service changed from Bedrock to Google AI (Gemini) — read before you provision anything for it

**This is a decision change from the original spec, made 2026-09-24, and it needs
sign-off before it touches real data.** The original plan (`docs/AWS-REQUIREMENTS.md`
§4, and the "Everything must stay inside AWS" line in its §1) was Bedrock, chosen
specifically because it keeps applicant data inside AWS, per client spec §3 and §13.
The Google AI Gemini Developer API is a public Google endpoint reached over the
internet with an API key — using it means English answers (not names — those are
filtered out, but hometowns, education and work history are not) leave AWS and go to
Google. That's the same category of exception `docs/DEPLOY-TRIAL.md` already
documents for Groq, which is explicitly marked **dummy-data trial only, never real
applicant data** for this exact reason.

Get written confirmation from 佐野様/the client that this is acceptable before
`AI_PROVIDER` is anything other than `mock` in the environment that holds real data.
If it isn't acceptable, nothing is lost — the Bedrock provider is still fully
implemented in the codebase (`src/lib/ai/bedrock.ts`) and switching back is a
config change, not a rebuild.

Technically, this needs no code change either way: the app's AI provider is a
pluggable interface (`src/lib/ai/provider.ts`), and Gemini's OpenAI-compatible
endpoint (`https://generativelanguage.googleapis.com/v1beta/openai`) works through
the `AI_PROVIDER=openai-compatible` path that already exists (the same one the trial
uses for Groq). No Bedrock IAM permission on the instance role is needed — the
Gemini key is an application secret in Parameter Store, like the SES password.

## 4. Set up CI/CD in your account

**No S3 bucket anywhere in this pipeline.** GitHub Actions doesn't stage or
upload the source at all — it just tells the instance, over SSM, to
`git fetch` and `git reset --hard` to the pushed commit itself, then rebuild.
The instance reads straight from GitHub with its own read-only deploy key.
This is the current mechanism (decided 2026-09-24, replacing an earlier
tar-via-S3 design) — see `docs/ci-cd/README.md` for the full rationale.

The deploy workflow itself (`.github/workflows/deploy.yml`) needs no code
changes for the account move — it reads the target account and instance
entirely from two GitHub repository variables, plus the instance needs its
own deploy key (a one-time step, not a GitHub variable). Follow
`docs/ci-cd/README.md` steps 1–2.5 **in your AWS account**:

1. Register GitHub as an OIDC identity provider (skip if this account already
   has one for any repo).
2. Create the deploy role using `docs/ci-cd/trust-policy.json` and
   `docs/ci-cd/deploy-permissions.json` as templates — **but edit both files
   first**:
   - `trust-policy.json` hard-codes our trial account ID (`514917275273`) in
     the `Federated` ARN. Replace it with yours.
   - `deploy-permissions.json` hard-codes the trial instance's ARN. Replace it
     with your instance's ARN once it exists. It only grants `ssm:SendCommand`
     against that one instance plus read access to the command result — no S3
     permissions are in it, or needed.
3. Generate a fresh SSH key pair **on the new instance itself** and register
   its public half as a read-only deploy key on the GitHub repo (§2.5 of
   `docs/ci-cd/README.md`). Don't reuse the trial instance's key — each
   instance gets its own, so one leaking doesn't expose the other.

**Region mismatch to fix while you're in these files:** the trial instance and
role live in `us-east-1` — `deploy-permissions.json`'s resource ARN says so,
and so does the workflow's default region when `AWS_REGION` is unset. That was never meant
to be the production region; `docs/AWS-REQUIREMENTS.md` specifies Tokyo
(`ap-northeast-1`) throughout — confirmed necessary regardless of the AI
provider decision (§3b): it's the region for the EC2 instance and SES sending
identity either way. If your instance goes up in `ap-northeast-1`
(it should), update:

- The instance/role ARNs in the policy JSON (region segment)
- The `AWS_REGION` repository variable → `ap-northeast-1` (§5). The workflow
  reads its region from that variable and falls back to `us-east-1` (the
  trial) when it is unset, so no code change is needed.

## 5. Point GitHub at the new account

Repo → **Settings → Secrets and variables → Actions → Variables**. Replace the
two trial values:

| Variable | Trial value | Set to |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | role in account `514917275273` | the role ARN from §4.2, your account |
| `DEPLOY_INSTANCE_ID` | `i-0521602aa68362440` | your new EC2 instance ID |
| `AWS_REGION` | unset (= `us-east-1`) | `ap-northeast-1` |

**These variables decide where every push to `main` deploys.** Changing them
switches auto-deploy from the trial to production in one go; the trial keeps
running, it just stops receiving updates.

No GitHub Secrets are used anywhere in this workflow (OIDC issues temporary
credentials per run) — only Variables. The one other GitHub-side change is
the deploy key from §4.3 (**Settings → Deploy keys**, not Variables) — that's
per-instance, not per-account, so it isn't a repository variable.

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

# STORAGE_DRIVER: unchanged from the trial — still "local" for now, see §3a
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage           # maps to the docker-compose.prod.yml volume

# AI_PROVIDER: leave as "mock" until the Gemini sign-off in §3b is in writing
AI_PROVIDER=openai-compatible          # was: mock
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<gemini api key>            # from Parameter Store
AI_MODEL=<gemini model name>           # check the current model list in AI Studio

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
echo "POSTGRES_PASSWORD=<same password as in DATABASE_URL>" > .env

# The app's storage volume (see §3a) — create it before first `up`, same as
# the postgres data directory already needs. The app runs as uid 1001, so it
# must own the storage folder or photo uploads fail:
sudo mkdir -p /var/lib/skillsheet/storage /var/lib/skillsheet/postgres
sudo chown 1001:1001 /var/lib/skillsheet/storage

docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# The runtime image has no Prisma CLI / tsx — use the `tools` service:
docker compose -f docker-compose.prod.yml --env-file .env run --rm tools npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env run --rm -e SEED_ADMIN_EMAIL=<your address> tools npm run db:seed
```

**Do not run `npm run db:demo`.** That command loads the trial's dummy
applicants (`data/sample-responses*.csv`) through the real import path — it
was for the trial only. Production starts from an empty `FormResponse` table
and real applicants get imported through the app's own import screen.

Set up the nightly backup cron from AWS-REQUIREMENTS.md §3 at this point too —
it's not part of `docker-compose.prod.yml` and won't exist unless you add it.

After this first deploy, subsequent ones are a `git push` to `main`: GitHub
Actions tells the instance via SSM to `git fetch`/`git reset --hard` to that
commit itself (using the deploy key from §4.3) and rebuilds the container.
**Database migrations are not part of that workflow** — if a change includes
a Prisma migration, run
`docker compose -f docker-compose.prod.yml --env-file .env run --rm tools npx prisma migrate deploy`
by hand after that deploy.

## 8. Verify before handing off

- `GET https://dx.morabu.com/api/health` → `200`, and the body's `checks`
  show `ai: provider=openai-compatible` (or `mock` if the Gemini sign-off in
  §3b is still pending), `storage: driver=local`, `mail: transport=smtp`,
  `database: ok=true`
- Send yourself a real login link and confirm it arrives via SES (not just
  logged to the console, which is all the trial ever did)
- Import one real record, upload a photo, confirm it's actually on
  `/var/lib/skillsheet/storage` on the host (not just inside the container —
  that's the volume mount from §3a doing its job) and still there after a
  redeploy
- Generate a PDF and confirm Japanese text renders (the `fonts-noto-cjk`
  package is already in the Docker image, but worth checking once on real
  infrastructure)
- Confirm the nightly `pg_dump` cron entry is present and its output is
  actually landing in `/var/backups/skillsheet` (interim local destination,
  §3 of AWS-REQUIREMENTS.md)

## 9. Decommission the trial

- Disable or delete the trial's `trial@morabu.com` demo account, or at least
  drop its role from `ADMIN` back to `VIEWER` (`docs/DEPLOY-TRIAL.md` §5)
- Delete the 5 dummy people from the trial instance
- Terminate the trial EC2 instance and its resources once you're confident in
  production, or keep it around as a staging box — your call; nothing in the
  application assumes it still exists
- The trial's IAM deploy role in account `514917275273` can be deleted once
  `DEPLOY_INSTANCE_ID` in GitHub no longer points at that instance
- The trial instance's deploy key can be removed from **Settings → Deploy
  keys** on the GitHub repo at the same time — it has no use once that
  instance is gone
