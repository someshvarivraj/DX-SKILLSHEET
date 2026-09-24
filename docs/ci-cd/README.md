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

インスタンス上で（初回セットアップ時、`ubuntu`または実行ユーザーで）：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dx-skillsheet-deploy -N "" -C "dx-skillsheet-ec2-deploy"
cat ~/.ssh/dx-skillsheet-deploy.pub
```

表示された公開鍵を GitHub の `someshvarivraj/DX-SKILLSHEET` →
**Settings → Deploy keys → Add deploy key** に登録する。**"Allow write access"
はチェックしない**（read-onlyで十分、書き込み権限を与える理由がない）。

インスタンス上の `~/.ssh/config` に追記し、このリポジトリへの接続だけこの鍵を
使うようにする：

```
Host github.com-dx-skillsheet
  HostName github.com
  User git
  IdentityFile ~/.ssh/dx-skillsheet-deploy
  IdentitiesOnly yes
```

`/opt/dx-skillsheet` のgit remoteをこのホスト名に向ける（初回 `git clone` を
このURLで行うか、既存のcloneなら差し替える）：

```bash
cd /opt/dx-skillsheet
git remote set-url origin git@github.com-dx-skillsheet:someshvarivraj/DX-SKILLSHEET.git
git fetch origin main   # 疎通確認
```

**新しいインスタンス（本番などの別AWSアカウント）に移すときは、この鍵は
使い回さない。** インスタンスごとに新しい鍵ペアを作り、GitHub側にも
別のデプロイキーとして追加する（1つのリポジトリに複数のデプロイキーを
登録できる）。そうすれば、片方のインスタンスの鍵が漏れても、もう片方には
影響しない。

## 3. GitHub側にリポジトリ変数を2つ設定する

GitHubの `someshvarivraj/DX-SKILLSHEET` → **Settings → Secrets and variables →
Actions → Variables タブ** → **New repository variable** で以下を追加する。
（**Secrets タブではなく Variables タブ**。ARNやインスタンスIDは秘密情報では
ないため、シークレットとして扱う必要はない。）

| 変数名 | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | ステップ2で取得したロールのARN |
| `DEPLOY_INSTANCE_ID` | `i-0521602aa68362440` |

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
GitHub側はステップ3の2つの変数を新しい値に差し替えるだけで、ワークフロー本体
（`.github/workflows/deploy.yml`）は変更不要である。S3バケットは、この構成では
どのAWSアカウントでも一切作る必要がない。
