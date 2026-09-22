# GitHub → AWS 自動デプロイのセットアップ（一度きり）

`main` に push するたびに、体験環境（EC2）へ自動で反映されるようにする設定である。
`.github/workflows/deploy.yml` がその手順を実行する。長期のAWSアクセスキーは
どこにも保存しない（GitHub の OIDC を使い、実行のたびに一時的な認証情報を
発行する方式）。

**このリポジトリでは既に動く状態にはなっていない。** 以下の3ステップを
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

`deploy-permissions.json` の権限は最小限に絞ってある：S3の配布用バケットへの
アップロードと、この体験用EC2インスタンス1台へのSSMコマンド送信のみ。
それ以外（他のインスタンスの操作やIAM自体の変更など）はできない。

実行後、ロールのARNが必要になる（次のステップで使う）：

```bash
aws iam get-role --role-name dx-skillsheet-github-deploy --query 'Role.Arn' --output text
# 例: arn:aws:iam::514917275273:role/dx-skillsheet-github-deploy
```

## 2.5 体験用EC2インスタンス自身のS3読み取り権限も広げる

体験環境の構築時、EC2インスタンス自身のIAMロール(`dx-skillsheet-ec2`)には
S3から読み取れるオブジェクトが `app.tar.gz` という決め打ちのファイル名1つだけに
制限されていた(最初の手動デプロイのときの名残)。このCI/CDワークフローは
コミットのSHAを含むファイル名(`app-<sha>.tar.gz`)を毎回アップロードするため、
このままでは EC2 側が403 Forbiddenで読み取りに失敗する。

同じディレクトリの `ec2-read-deploy-artifact-policy.json` で、バケット内の
オブジェクト全体を読めるように広げてある。EC2インスタンスのロール名は環境
ごとに異なる可能性があるため、実際のロール名を確認してから適用すること
(体験環境では `dx-skillsheet-ec2`)。

```bash
aws iam put-role-policy \
  --role-name dx-skillsheet-ec2 \
  --policy-name read-deploy-artifact \
  --policy-document file://ec2-read-deploy-artifact-policy.json
```

## 3. GitHub側にリポジトリ変数を3つ設定する

GitHubの `someshvarivraj/DX-SKILLSHEET` → **Settings → Secrets and variables →
Actions → Variables タブ** → **New repository variable** で以下を追加する。
（**Secrets タブではなく Variables タブ**。ARNやインスタンスIDは秘密情報では
ないため、シークレットとして扱う必要はない。）

| 変数名 | 値 |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | ステップ2で取得したロールのARN |
| `DEPLOY_BUCKET` | `dx-skillsheet-deploy-514917275273` |
| `DEPLOY_INSTANCE_ID` | `i-0521602aa68362440` |

---

## 以上で完了

次に `main` へ push すると、Actions タブに `Deploy to trial EC2` が走り、
自動でEC2上のコンテナが再ビルド・再起動される。手動で `workflow_dispatch`
から実行することもできる。

データベースのスキーマ変更（マイグレーション）はこのワークフローには
含まれていない。これまでどおり手動で `prisma db push` 等を実行すること
（`docs/DEPLOY-TRIAL.md` 参照）。

---

## 本番の別AWSアカウントへ移すとき

新しいAWSアカウントで、このディレクトリの `trust-policy.json` の
アカウントID（`514917275273`）と、`deploy-permissions.json` のバケット名・
インスタンスARNを新環境のものに差し替えてから、上のステップ1〜2を新アカウント
で実行する。GitHub側はステップ3の3つの変数を新しい値に差し替えるだけで、
ワークフロー本体（`.github/workflows/deploy.yml`）は変更不要である。
