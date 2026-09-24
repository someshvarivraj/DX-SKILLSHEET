# GitHub → AWS 自動デプロイのセットアップ（一度きり）

`main` に push するたびに、体験環境（EC2）へ自動で反映されるようにする設定である。
`.github/workflows/deploy.yml` がその手順を実行する。長期のAWSアクセスキーは
どこにも保存しない（GitHub の OIDC を使い、実行のたびに一時的な認証情報を
発行する方式）。

**S3は使わない。** GitHub Actionsは「gitのSHAをpullして再ビルドせよ」という
指示をSSM経由でインスタンスに送るだけで、ソース自体はインスタンスが自分で
GitHubから直接 `git fetch` する（2026-09-24決定、以前はS3にtarを置く方式
だった）。そのためインスタンス側に、このprivateリポジトリを読めるだけの
デプロイキーが必要になる — ステップ2.5で設定する。

**このリポジトリでは既に動く状態にはなっていない。** 以下の4ステップを
一度だけ実行する必要がある。AWSの管理者権限（IAMロールを作れる権限）を
持つ人が、AWS CLIまたはCloudShellから行う。

---

## 1. GitHub をAWSの信頼できる認証元として登録する（アカウントにつき一度）

このAWSアカウントで他のリポジトリでも既にGitHub Actions用のOIDCを設定して
いる場合は、このステップは不要（`aws iam list-open-id-connect-providers` で
`token.actions.githubusercontent.com` が出ていれば済んでいる）。

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea 1c58a3a8518e8759bf075b76b750d4f2df264fcd
```

## 2. デプロイ用のIAMロールを作る

このディレクトリの `trust-policy.json` は、`someshvarivraj/DX-SKILLSHEET` の
`main` ブランチへのpushだけがこのロールを引き受けられるように制限してある
（他のリポジトリや他のブランチからは使えない）。

> **注意:** リポジトリの名前変更・移譲があったGitHubアカウントでは、OIDCトークンの
> `sub` クレームが `repo:OWNER/REPO:ref:...` ではなく
> `repo:OWNER@OWNER_ID/REPO@REPO_ID:ref:...`（所有者IDとリポジトリIDが付く形式）に
> なることがある。そのため `trust-policy.json` では `@*` のワイルドカードを使って
> 両方の形式に対応させてある。新しいアカウントに移す際も、実際の値は
> CloudTrail（`sts.amazonaws.com` の `AssumeRoleWithWebIdentity` イベント、
> `errorCode: AccessDenied` のとき）で確認するのが確実。

```bash
cd docs/ci-cd

aws iam create-role \
  --role-name dx-skillsheet-github-deploy \
  --assume-role-policy-document file://trust-policy.json

aws iam put-role-policy \
  --role-name dx-skillsheet-github-deploy \
  --policy-name dx-skillsheet-deploy-permissions \
  --policy-document file://deploy-permissions.json
```

`deploy-permissions.json` の権限は最小限に絞ってある：この体験用EC2インスタンス
1台へのSSMコマンド送信と、その結果の読み取りのみ。それ以外（他のインスタンスの
操作やIAM自体の変更、S3など）はできない — S3を使わない構成になったため、この
ロールにS3権限は一切含めていない。

実行後、ロールのARNが必要になる（次のステップで使う）：

```bash
aws iam get-role --role-name dx-skillsheet-github-deploy --query 'Role.Arn' --output text
# 例: arn:aws:iam::514917275273:role/dx-skillsheet-github-deploy
```

## 2.5 インスタンスにデプロイキーを設定する（S3を使わないための唯一の追加作業）

`someshvarivraj/DX-SKILLSHEET` はprivateリポジトリなので、インスタンス自身が
`git fetch` するには、そのリポジトリを読める認証情報が要る。read-onlyの
デプロイキー（このリポジトリ専用、書き込み不可）を使う — 個人のGitHub
アカウントの認証情報や長期のPATはインスタンスに置かない。

**すべてインスタンス上の root で行う。** デプロイは SSM の `AWS-RunShellScript`
経由で実行され、これは root として動くため、鍵・`ssh` 設定・git の設定はすべて
`/root` 側に置く必要がある（`ssm-user` や `ec2-user` の `~/.ssh` に置いても
デプロイからは見えない）。AWS CloudShell ではなく、EC2コンソール →
インスタンス → **接続 → Session Manager** でインスタンス自体に入り、
`sudo -i` で root になってから実行する。

体験環境のインスタンスは Amazon Linux 2023 で、git は最初から入っていない
（入っていないとデプロイは `git: command not found`（exit 127）で失敗する）。

```bash
sudo -i
dnf install -y git
mkdir -p /root/.ssh && chmod 700 /root/.ssh
ssh-keygen -t ed25519 -f /root/.ssh/dx-skillsheet-deploy -N "" -C "dx-skillsheet-ec2-deploy"
cat >> /root/.ssh/config <<'EOF'
Host github.com-dx-skillsheet
  HostName github.com
  User git
  IdentityFile /root/.ssh/dx-skillsheet-deploy
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
ssh-keyscan github.com >> /root/.ssh/known_hosts
cat /root/.ssh/dx-skillsheet-deploy.pub
```

`~/.ssh/config` のエントリにより、このリポジトリへの接続だけこの鍵を使う。

表示された公開鍵（`ssh-ed25519 ...` の1行全体）を GitHub の
`someshvarivraj/DX-SKILLSHEET` → **Settings → Deploy keys → Add deploy key**
に登録する。**"Allow write access" はチェックしない**（read-onlyで十分、
書き込み権限を与える理由がない）。

次に `/opt/dx-skillsheet` をgitの作業ツリーにする。以前のS3方式で展開された
ディレクトリには `.git` が無いので、その場で `git init` してから最新の `main`
に合わせる。`.env` と `.env.production` は `.gitignore` 対象なので
`reset --hard` で消えない。念のため先にバックアップを取る。
ディレクトリの所有者は `ssm-user` だが git は root で動くため、
`safe.directory` の設定が必須（無いと "dubious ownership" で失敗する）。
**`--global` ではなく `--system`（`/etc/gitconfig`）に書くこと** — SSM は `HOME` を
設定せずにコマンドを実行するため、`/root/.gitconfig` はデプロイ時に読まれない。

```bash
cp -a /opt/dx-skillsheet /opt/dx-skillsheet-prev-before-git
cd /opt/dx-skillsheet
git init -b main
git remote add origin git@github.com-dx-skillsheet:someshvarivraj/DX-SKILLSHEET.git
git config --system --add safe.directory /opt/dx-skillsheet   # --globalは不可（下記）
git fetch origin main && git reset --hard origin/main   # 疎通確認を兼ねる
git log --oneline -1
```

新しいインスタンスで最初から作る場合は、上の代わりに
`git clone git@github.com-dx-skillsheet:someshvarivraj/DX-SKILLSHEET.git /opt/dx-skillsheet`
としてから `.env` / `.env.production` を置けばよい（`safe.directory` は
root で clone するなら不要）。

**新しいインスタンス（本番などの別AWSアカウント）に移すときは、この鍵は
使い回さない。** インスタンスごとに新しい鍵ペアを作り、GitHub側にも
別のデプロイキーとして追加する（1つのリポジトリに複数のデプロイキーを
登録できる）。そうすれば、片方のインスタンスの鍵が漏れても、もう片方には
影響しない。

## 3. GitHub側にリポジトリ変数を設定する

GitHubの `someshvarivraj/DX-SKILLSHEET` → **Settings → Secrets and variables →
Actions → Variables タブ** → **New repository variable** で以下を追加する。
（**Secrets タブではなく Variables タブ**。ARNやインスタンスIDは秘密情報では
ないため、シークレットとして扱う必要はない。）

| 変数名 | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | ステップ2で取得したロールのARN |
| `DEPLOY_INSTANCE_ID` | `i-0521602aa68362440` |
| `AWS_REGION` | 体験環境では設定しない（未設定なら `us-east-1`）。本番（東京）では `ap-northeast-1` |
| `DEPLOY_DIR` | 体験環境では設定しない（未設定なら `/opt/dx-skillsheet`）。会社のサーバーでは `/opt/apps/skill-sheet-2` |

---

## 以上で完了

次に `main` へ push すると、Actions タブに `Deploy to trial EC2` が走り、
自動でEC2上のコンテナが再ビルド・再起動される。手動で `workflow_dispatch`
から実行することもできる。

データベースのスキーマ変更（マイグレーション）はこのワークフローには
含まれていない。これまでどおり手動で `prisma migrate deploy` 等を実行すること
（`docs/DEPLOY-TRIAL.md` 参照）。

---

## 本番の別AWSアカウントへ移すとき

新しいAWSアカウントで、このディレクトリの `trust-policy.json` の
アカウントID（`514917275273`）と、`deploy-permissions.json` のインスタンス
ARNを新環境のものに差し替えてから、上のステップ1・2を新アカウントで実行する。
ステップ2.5（デプロイキー）は新しいインスタンスごとに必ずやり直す — 使い回さない。
GitHub側はステップ3の変数（`AWS_REGION` を含む）を新しい値に差し替えるだけで、ワークフロー本体
（`.github/workflows/deploy.yml`）は変更不要である。S3バケットは、この構成では
どのAWSアカウントでも一切作る必要がない。
