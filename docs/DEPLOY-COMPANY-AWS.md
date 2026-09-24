# Deploying skill-sheet-2 to the company AWS account — step by step

**For:** whoever sets up the production environment in the company's AWS account
**Result:** this application running as **`skill-sheet-2`** on the company's
existing EC2 instance, next to the apps already there, auto-deploying on every
push to `main`

This is the hands-on runbook: every command, in order, with the values for the
company server already filled in (surveyed 2026-09-24). For the reasoning
behind the choices (why local disk instead of S3, why the Gemini sign-off
matters), see `docs/AWS-TRANSITION.md` and `docs/AWS-REQUIREMENTS.md`. The
pitfalls these steps avoid are listed at the end.

## The company server at a glance

| Item | Value |
|---|---|
| AWS account | `889002527739` |
| Region | `ap-northeast-1` (Tokyo) |
| Instance | Amazon Linux 2023, 2 vCPU, 3.7 GB RAM, 20 GB disk (16 GB free), no swap |
| Instance role | `morabu-dx-ec2-role` — already has `AmazonSSMManagedInstanceCore` |
| Web server | nginx on 80/443, certificates by certbot (Let's Encrypt) |
| Already running | `/opt/apps/pedometer`, `/opt/apps/network-monitor`, a Next.js app on port 3000, `dx.morabu.com` site |
| Timezone | UTC |
| Missing | Docker (+ compose/buildx), cron |

**`/opt/apps/skill-sheet` (from 2 Sep) is a different, older project.** Do not
touch it, its backups in `/opt/backups/skill-sheet`, its nginx config
(`/etc/nginx/conf.d/skill-sheet.conf`), or the existing `dx.morabu.com` server
block. Everything this app creates is named `skill-sheet-2`:

| What | Where |
|---|---|
| Code (git checkout) | `/opt/apps/skill-sheet-2` |
| Database, photos, PDFs | `/var/lib/skill-sheet-2/` |
| Nightly DB backups | `/var/backups/skill-sheet-2/` |
| App port (local only) | `127.0.0.1:3100` (3000 is taken) |
| Containers | `skill-sheet-2-app-1`, `skill-sheet-2-db-1` |
| nginx site | `/etc/nginx/conf.d/skill-sheet-2.conf` |
| Secrets | Parameter Store `/skill-sheet-2/*` |

**Ground rule for a shared server:** add, never replace. Install only what is
missing, add permissions to the existing role, add a new nginx site, and don't
change server-wide settings (timezone, existing sites).

Nothing here touches the trial environment. It keeps running in its own account
until you decommission it (step 14).

Placeholders still to fill in:

| Placeholder | Meaning |
|---|---|
| `<APP_DOMAIN>` | the address for this app, **not decided yet** — e.g. a new subdomain such as `skill-sheet-2.morabu.com`. Needed from step 7 on. (Using `dx.morabu.com` itself would mean changing the existing site — agree that with the server owner first; not covered here) |
| `<INSTANCE_ID>` | the instance ID (`i-...`) — step 1 prints it |
| `<ADMIN_EMAIL>` | your `@morabu.com` address — becomes the first admin |

Where the commands run:

- **CloudShell** = AWS console → CloudShell icon (top bar), **account
  `889002527739`, region Tokyo**. Prompt looks like `~ $`.
- **Instance** = EC2 console → the instance → **Connect → Session Manager →
  Connect**, then `sudo -i`. Prompt looks like `[root@ip-10-0-1-149 ~]#`.

A command meant for the instance fails with "Permission denied" or "No such
file" in CloudShell — check the prompt first.

---

## 0. Before you start (decisions, not commands)

- [ ] **Server owner's OK** to install Docker, add swap, add an nginx site and
      a PostgreSQL container, and to let GitHub Actions trigger rebuilds on
      this server (step 10 explains exactly what that access is).
- [ ] **`<APP_DOMAIN>` decided**, and someone who can add its DNS record.
- [ ] **Gemini sign-off.** Until the client confirms in writing that applicant
      answers may be sent to Google's Gemini API, run with `AI_PROVIDER=mock`
      (step 7 shows both). Everything except the AI-generated Japanese works.
- [ ] **GitHub admin** on `someshvarivraj/DX-SKILLSHEET` (deploy key, repository
      variables). If the repository moves to a company GitHub organization, do
      that **first** — the OIDC trust policy in step 10 names the repository.

## 1. Note the instance ID and public IP (Instance, as root)

```bash
TOKEN=$(curl -sX PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id; echo
curl -sH "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4; echo
```

The first line is `<INSTANCE_ID>`. The second is the address `<APP_DOMAIN>`'s
DNS record will point to (step 9) — it should be the same address
`dx.morabu.com` already points to.

## 2. Secrets in Parameter Store (CloudShell)

```bash
export AWS_REGION=ap-northeast-1

aws ssm put-parameter --name /skill-sheet-2/AUTH_SECRET --type SecureString \
  --value "$(openssl rand -base64 48)"
# hex, not base64: this ends up inside DATABASE_URL, where / + = would break it
aws ssm put-parameter --name /skill-sheet-2/POSTGRES_PASSWORD --type SecureString \
  --value "$(openssl rand -hex 24)"
```

## 3. Amazon SES (console, region Tokyo)

1. **SES → Identities.** If `morabu.com` is already listed as **Verified**, skip
   to 2. Otherwise **Create identity → Domain** → `morabu.com`, Easy DKIM, add
   the 3 CNAME records it shows to DNS and wait for **Verified**.
2. **SES → Account dashboard** → if it says "sandbox", **Request production
   access** (mail can otherwise only go to verified addresses). Approval takes
   up to a day — start this early.
3. **SES → SMTP settings → Create SMTP credentials**, then store them
   (CloudShell):

```bash
aws ssm put-parameter --name /skill-sheet-2/SMTP_USER --type SecureString --value '<smtp username>'
aws ssm put-parameter --name /skill-sheet-2/SMTP_PASSWORD --type SecureString --value '<smtp password>'
```

## 4. Let the instance read its secrets (CloudShell)

`morabu-dx-ec2-role` already has SSM access. Add one inline policy that can
read `/skill-sheet-2/*` and nothing else — nothing existing is changed:

```bash
cat > skill-sheet-2-params.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
 "Action":["ssm:GetParameter","ssm:GetParameters"],
 "Resource":"arn:aws:ssm:ap-northeast-1:889002527739:parameter/skill-sheet-2/*"}]}
EOF
aws iam put-role-policy --role-name morabu-dx-ec2-role \
  --policy-name read-skill-sheet-2-params --policy-document file://skill-sheet-2-params.json
```

## 5. Prepare the server (Instance, as root)

**Swap (2 GB).** The server has none, and only ~2.6 GB of memory is free.
Chromium (PDF export) and each deploy's build spike memory; without swap the
kernel kills a process to recover — possibly one of the other apps.

```bash
dd if=/dev/zero of=/swapfile bs=1M count=2048 && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
free -h     # Swap: 2.0Gi
```

**Docker, compose, buildx, cron** (none are installed; git already is):

```bash
dnf install -y docker cronie
systemctl enable --now docker crond

# the AL2023 docker package ships neither plugin; the Dockerfile needs buildx >= 0.17
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
curl -fSL https://github.com/docker/buildx/releases/download/v0.17.1/buildx-v0.17.1.linux-amd64 \
  -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/*
docker compose version && docker buildx version
```

Installing Docker adds its own network rules but doesn't change nginx or the
existing apps. Check they still respond afterwards (e.g. open the existing
sites in a browser).

**Folders for this app:**

```bash
mkdir -p /var/lib/skill-sheet-2/storage /var/lib/skill-sheet-2/postgres /var/backups/skill-sheet-2
chown 1001:1001 /var/lib/skill-sheet-2/storage   # the app container runs as uid 1001
```

**Disk (recommended).** 16 GB free is enough to start, but Docker images, the
database, photos, PDFs and backups all grow on it. Growing the volume to 30 GB
needs no downtime: EC2 console → the instance → **Storage** → the volume →
**Modify volume** → 30 GiB, wait for "optimizing", then on the instance:

```bash
growpart /dev/nvme0n1 1 && xfs_growfs -d / && df -h /
```

## 6. Deploy key and first checkout (Instance, as root)

The CI/CD deploy runs as root via SSM, so the key lives under `/root`. The
`Host` alias below applies only to this repository.

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
ssh-keygen -t ed25519 -f /root/.ssh/skill-sheet-2-deploy -N "" -C skill-sheet-2-deploy
cat >> /root/.ssh/config <<'EOF'

Host github.com-dx-skillsheet
  HostName github.com
  User git
  IdentityFile /root/.ssh/skill-sheet-2-deploy
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
ssh-keyscan github.com >> /root/.ssh/known_hosts
cat /root/.ssh/skill-sheet-2-deploy.pub
```

Copy the whole printed line (`ssh-ed25519 ... skill-sheet-2-deploy`) to GitHub
→ repository → **Settings → Deploy keys → Add deploy key**, title
`company-ec2 skill-sheet-2`, **"Allow write access" unchecked**.

```bash
git clone git@github.com-dx-skillsheet:someshvarivraj/DX-SKILLSHEET.git /opt/apps/skill-sheet-2
cd /opt/apps/skill-sheet-2 && git log --oneline -1
# SSM runs deploys without HOME, so root's ~/.gitconfig is never read
git config --system --add safe.directory /opt/apps/skill-sheet-2
```

## 7. Environment files (Instance, as root)

Built from Parameter Store, so no secret is typed by hand. **No quotes around
values** — Docker reads quotes literally. Replace `<APP_DOMAIN>` first.

```bash
cd /opt/apps/skill-sheet-2
p() { aws ssm get-parameter --region ap-northeast-1 --with-decryption \
        --name "/skill-sheet-2/$1" --query Parameter.Value --output text; }

# read by docker compose itself: db password, host port, data folder
cat > .env <<EOF
POSTGRES_PASSWORD=$(p POSTGRES_PASSWORD)
APP_PORT=3100
DATA_DIR=/var/lib/skill-sheet-2
EOF

cat > .env.production <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://skillsheet:$(p POSTGRES_PASSWORD)@db:5432/skillsheet?schema=public

APP_URL=https://<APP_DOMAIN>
APP_NAME=スキルシート管理システム
COMPANY_NAME=モラブ阪神工業株式会社

AUTH_SECRET=$(p AUTH_SECRET)
AUTH_ALLOWED_EMAIL_DOMAINS=morabu.com
AUTH_LINK_TTL_MINUTES=15
AUTH_SESSION_TTL_DAYS=30
DEMO_ACCOUNT_EMAIL=
DEMO_ACCOUNT_PASSWORD=
NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED=false

MAIL_TRANSPORT=smtp
MAIL_FROM=skillsheet@morabu.com
SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=$(p SMTP_USER)
SMTP_PASSWORD=$(p SMTP_PASSWORD)

STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage

AI_PROVIDER=mock

CHROMIUM_PATH=/usr/bin/chromium
PDF_MAX_CONCURRENCY=1
PDF_FOOTER_SHOW_TIME=false
EOF
chmod 600 .env .env.production
grep -c '<APP_DOMAIN>' .env.production   # must print 0
```

`PORT=3000` is the port *inside* the container and stays 3000; `APP_PORT=3100`
is the port on the server. The database host is **`db`** (the compose
service), not `127.0.0.1`. `APP_URL` is used in login-link emails, so it must
be the real final address.

**Only after the Gemini sign-off**, store the key (CloudShell:
`aws ssm put-parameter --name /skill-sheet-2/AI_API_KEY --type SecureString --value '<key>'`)
and replace the `AI_PROVIDER=mock` line with:

```bash
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_API_KEY=<value of /skill-sheet-2/AI_API_KEY>
AI_MODEL=<model name from Google AI Studio>
AI_TEMPERATURE=0
AI_MAX_TOKENS=1500
AI_TIMEOUT_MS=60000
```

then `docker compose -f docker-compose.prod.yml --env-file .env up -d app`.

## 8. First start and database setup (Instance, as root)

```bash
cd /opt/apps/skill-sheet-2
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml --env-file .env ps   # db "healthy", app "healthy" after ~1 min
curl -s http://127.0.0.1:3100/api/health; echo
```

The first build takes several minutes of heavy CPU/memory — do it at a quiet
time for the other apps. Every later deploy rebuilds too (step 10).

**Schema and initial data.** The production image contains only the built app
— not the Prisma CLI or the seed runner — so these run in the `tools` service
(the Dockerfile's `builder` stage; never started by normal deploys):

```bash
docker compose -f docker-compose.prod.yml --env-file .env run --rm tools \
  npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env run --rm \
  -e SEED_ADMIN_EMAIL=<ADMIN_EMAIL> -e SEED_ADMIN_NAME=管理者 tools npm run db:seed
```

`db:seed` loads **setup data only, no applicants**: the form questions, field
definitions, glossary, and the first admin login (`SEED_ADMIN_EMAIL`). It is
required — without it imports can't map columns and nobody can sign in. It
creates no demo account because `DEMO_ACCOUNT_EMAIL` is blank. The app starts
with zero applicants; real ones come in through its import screen.

**Never run `npm run db:demo` here** — that is the one that loads the trial's
5 dummy applicants.

## 9. DNS and HTTPS (DNS provider, then Instance as root)

1. **DNS:** add an `A` record `<APP_DOMAIN>` → the public IP from step 1.
   Wait until `nslookup <APP_DOMAIN>` (from any machine) returns it.
2. **nginx site** — a new file; no existing file is edited. Set `DOMAIN` to
   the real address first:

```bash
DOMAIN=<APP_DOMAIN>          # e.g. skill-sheet-2.morabu.com
cat > /etc/nginx/conf.d/skill-sheet-2.conf <<'EOF'
server {
  listen 80;
  listen [::]:80;
  server_name <APP_DOMAIN>;
  client_max_body_size 20m;            # response files and photos

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # audit log records client IPs
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;           # PDF generation can take a while
  }
}
EOF
sed -i "s/<APP_DOMAIN>/$DOMAIN/" /etc/nginx/conf.d/skill-sheet-2.conf
grep server_name /etc/nginx/conf.d/skill-sheet-2.conf
nginx -t && systemctl reload nginx
```

`nginx -t` must say "syntax is ok" before it reloads — if it fails,
`rm /etc/nginx/conf.d/skill-sheet-2.conf` and nothing else is affected.

3. **Certificate** — certbot is already used for `dx.morabu.com`; it adds the
   443 block to this new file only:

```bash
certbot --nginx -d $DOMAIN
curl -s https://$DOMAIN/api/health; echo
```

Renewal is already handled by however certbot renews `dx.morabu.com` on this
server.

## 10. CI/CD role for GitHub Actions (CloudShell)

**What this grants, so the server owner can agree to it:** pushes to `main` of
this one repository can make AWS run shell commands **as root on this
instance** (that is how the deploy runs `git fetch` and the rebuild), and
nothing else — no other instance, no other AWS service. Each deploy rebuilds
the image on the server: a few minutes of heavy CPU/memory.

Upload `docs/ci-cd/trust-policy.json` and `docs/ci-cd/deploy-permissions.json`
to CloudShell (**Actions → Upload file**) and **edit them first**:

- `trust-policy.json`: `514917275273` → `889002527739`. If the repository
  moved to another owner/name, update the `sub` line too.
- `deploy-permissions.json`: in **both** ARNs, `us-east-1` → `ap-northeast-1`
  and `514917275273` → `889002527739`; in the instance ARN,
  `i-0521602aa68362440` → `<INSTANCE_ID>`.

```bash
# GitHub as an identity provider — once per account; skip the create if the
# list already shows token.actions.githubusercontent.com
aws iam list-open-id-connect-providers
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea 1c58a3a8518e8759bf075b76b750d4f2df264fcd

aws iam create-role --role-name skill-sheet-2-github-deploy \
  --assume-role-policy-document file://trust-policy.json
aws iam put-role-policy --role-name skill-sheet-2-github-deploy \
  --policy-name skill-sheet-2-deploy-permissions --policy-document file://deploy-permissions.json
aws iam get-role --role-name skill-sheet-2-github-deploy --query Role.Arn --output text
```

## 11. Point GitHub at the company server

**Important:** there is one deploy workflow and it targets one instance. The
moment these variables change, pushes stop deploying to the trial and start
deploying here. The trial keeps running; it just stops receiving updates.

GitHub → repository → **Settings → Secrets and variables → Actions →
Variables** (the Variables tab, not Secrets):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | the ARN printed at the end of step 10 |
| `DEPLOY_INSTANCE_ID` | `<INSTANCE_ID>` |
| `AWS_REGION` | `ap-northeast-1` |
| `DEPLOY_DIR` | `/opt/apps/skill-sheet-2` |

Then **Actions → Deploy to trial EC2 → Run workflow** on `main`. The
"Trigger rebuild on EC2" step should end in `status: Success`.

## 12. Backups (Instance, as root)

The server runs on UTC, so `0 18` = 03:00 in Japan.

```bash
cat > /etc/cron.d/skill-sheet-2-backup <<'EOF'
0 18 * * * root docker compose -f /opt/apps/skill-sheet-2/docker-compose.prod.yml --env-file /opt/apps/skill-sheet-2/.env exec -T db pg_dump -U skillsheet skillsheet | gzip > /var/backups/skill-sheet-2/$(date +\%Y\%m\%d).sql.gz
30 18 * * * root find /var/backups/skill-sheet-2 -name '*.sql.gz' -mtime +90 -delete
EOF
chmod 644 /etc/cron.d/skill-sheet-2-backup
```

These backups sit on the same disk as the database. Ask the owner whether EBS
snapshots of this instance are already taken; if not, **EC2 → Lifecycle
Manager → Create policy** → daily snapshots of its volume, keep 14 — that
protects the other apps too.

## 13. Verify

```bash
curl -s https://<APP_DOMAIN>/api/health    # any machine
```

- [ ] HTTP 200; `database` ok, `mail: transport=smtp`, `storage: driver=local`,
      `ai: provider=mock` (or `openai-compatible` after sign-off)
- [ ] **`dx.morabu.com`, pedometer, network-monitor and the old skill-sheet
      still work**
- [ ] Sign in with `<ADMIN_EMAIL>` — the login link **arrives by email**
- [ ] Upload a photo; `ls /var/lib/skill-sheet-2/storage` shows it, and it is
      still there after a redeploy
- [ ] Generate a PDF; Japanese text renders (not boxes)
- [ ] Push a small change to `main` → deploy succeeds, change is live
- [ ] Next day: a `.sql.gz` in `/var/backups/skill-sheet-2`
- [ ] After a few days: `free -h` / `df -h /` still have headroom

**After a deploy that includes a database migration** (a new folder under
`prisma/migrations/`), CI/CD does not migrate — run on the instance:

```bash
cd /opt/apps/skill-sheet-2
docker compose -f docker-compose.prod.yml --env-file .env run --rm --build tools \
  npx prisma migrate deploy
```

**Disk housekeeping:** each deploy leaves the previous image behind.
`docker image prune -f` now and then removes those (Docker is only used by
this app on this server, so it affects nothing else).

## 14. Decommission the trial (whenever you're ready)

- Terminate the trial EC2 instance (`i-0521602aa68362440`, account
  `514917275273`, `us-east-1`) and release its resources
- Delete the IAM role `dx-skillsheet-github-deploy` in the trial account
- GitHub → **Settings → Deploy keys** → delete the trial instance's key

---

## Appendix: a new instance instead

If the shared server turns out too small, or the owner prefers not to share:
launch Amazon Linux 2023, `t3.medium`, 30 GiB gp3, no key pair, security group
with inbound 80/443 only, an instance profile with
`AmazonSSMManagedInstanceCore` plus the step 4 policy, and an Elastic IP. Then
follow steps 2–14, except: `APP_PORT` can stay 3000, and for HTTPS with no
nginx installed, Caddy is simplest:

```bash
docker run -d --name caddy --restart unless-stopped --network host \
  -v caddy_data:/data -v caddy_config:/config \
  caddy:2 caddy reverse-proxy --from <APP_DOMAIN> --to 127.0.0.1:3000
```

---

## Pitfalls these steps avoid

| Pitfall | What this runbook does |
|---|---|
| Overwriting the older `/opt/apps/skill-sheet` project or its database | separate folder, data dir, containers, nginx file and secrets, all `skill-sheet-2` |
| Attaching a different role to the shared instance — removes the permissions the other apps use | one inline policy **added** to `morabu-dx-ec2-role` |
| A second `server_name dx.morabu.com` block, or editing the existing one | new file for `<APP_DOMAIN>` only |
| Port 3000 already used by another app | `APP_PORT=3100` |
| No swap on a 3.7 GB server running several apps | 2 GB swap |
| Backup at the wrong hour on a UTC server | `0 18` UTC = 03:00 JST |
| `DATABASE_URL` pointing at `127.0.0.1` — inside the app container that is the app itself | host `db` |
| Running `prisma migrate deploy` / `db:seed` inside the app container — the runtime image has no Prisma CLI, `tsx` or seed sources | `docker compose ... run --rm tools ...` |
| Quoted values in `.env.production` — Docker's `env_file` keeps the quotes | values without quotes |
| base64 database password — `/ + =` break `DATABASE_URL` | `openssl rand -hex 24` |
| Storage folder owned by root — the app runs as uid 1001 | `chown 1001:1001` |
| Git set up for a normal user — SSM runs deploys as root without `HOME` | key under `/root`, `safe.directory` via `--system` |
| Deploy region / folder hardcoded to the trial's | `AWS_REGION` and `DEPLOY_DIR` repository variables |
