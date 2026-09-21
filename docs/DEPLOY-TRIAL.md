# 体験用環境の構築手順 / Trial deployment

佐野様に触っていただくための、ダミーデータ入りの環境を立てる手順である。
**実データは入れないこと。** 共有パスワードで入る体験用アカウントを使うため、
誰が何をしたかの記録が残らない。

---

## 1. 何が必要か

| 必要なもの | 用途 |
|---|---|
| PostgreSQL 15以上 | データベース |
| Node.js 22 / または Docker | アプリケーション |
| ディスク 1GB程度 | 画像とPDF |

AIは **mock**（生成しない）で動かす。佐野様からも「ダミーデータなので生成結果は
問われない」とのご連絡があり、この設定なら個人情報がどこにも送信されない。

---

## 2. 環境変数

`.env` を作り、以下を設定する。`*` は必ず自分で決める値である。

```bash
DATABASE_URL="postgresql://user:password@host:5432/skillsheet"

# * 32文字以上のランダム文字列。`openssl rand -base64 32` で作る
SESSION_SECRET="..."

# 体験用の共有アカウント（メール配信なしでログインできる）
DEMO_ACCOUNT_EMAIL="trial@morabu.com"
DEMO_ACCOUNT_PASSWORD="..."   # * 推測されない文字列
DEMO_ACCOUNT_ROLE="ADMIN"     # 体験中のみ。実データを入れる環境では VIEWER に戻す

# 管理者アカウント（メールでログインリンクを受け取る本来の方式）
SEED_ADMIN_EMAIL="あなたのアドレス"

# ログインリンクの送信先。console はサーバーのログに出すだけ
MAIL_TRANSPORT="console"

AI_PROVIDER="mock"
STORAGE_DRIVER="local"
STORAGE_LOCAL_PATH="./storage"
```

### Groq を使うとき

Groq の API は OpenAI 互換なので、**アプリ側の変更は不要**である。
上の3行を次に置き換えるだけで切り替わる。

```bash
AI_PROVIDER="openai-compatible"
AI_BASE_URL="https://api.groq.com/openai/v1"
AI_API_KEY="gsk_..."            # Groq のコンソールで発行した鍵
AI_MODEL="llama-3.3-70b-versatile"
```

**鍵の扱い。** `.env` はリポジトリに入れない（`.gitignore` 済み）。鍵は
Groq のコンソール（console.groq.com → API Keys）で発行し、サーバーの
環境変数として設定する。チャットやメールに貼らないこと。漏れた場合は
同じ画面で失効させ、作り直す。

**注意。** Groq は AWS の外にある。仕様書 §15 は「処理はAWS内で完結させる」と
定めているため、**実際の応募者データを入れた状態で Groq を有効にしてはいけない。**
ダミーデータの体験中に限る。本番でAIを使う場合は、佐野様に Bedrock の
ご承認をいただいてから `AI_PROVIDER="bedrock"` に切り替える。

---

## 3. 立ち上げ

```bash
npm ci
npx prisma generate
npm run db:deploy      # スキーマを作る
npm run db:seed        # 設問・項目定義・辞書・アカウント
npm run db:demo        # ダミーの対象者5名を取り込む
npm run build
npm start              # 既定で :3000
```

`db:demo` は `data/sample-responses*.csv` を**実際の取り込み機能を通して**
読み込む。画面から取り込んだ場合とまったく同じ経路なので、取り込み自体の
確認にもなる。1名は確定済みにしてあるので、PDF出力をすぐ試せる。

Docker を使う場合は `docker compose -f docker-compose.prod.yml up -d` のあと、
同じ `db:deploy` / `db:seed` / `db:demo` をコンテナ内で実行する。

---

## 4. 佐野様に試していただく5点と、その場所

| ご要望 | 画面 |
|---|---|
| チェックボックスで項目を出し分ける | 対象者を開く → 各項目の「表示」チェック。レコード単位は各レコードの「スキルシートに表示」 |
| 並び替えの挙動 | 項目定義 → 各項目の「表示順」を変更して保存 |
| 画面上で内容を直せるか | 対象者を開く → 各項目の入力欄を編集して「保存」 |
| 写真の登録 | 対象者を開く → 先頭の「写真」欄 |
| PDF出力 | 未確認項目を確認 → 「確定する」→「PDFをダウンロード」。確定済みの1名はすぐ出力できる |

インターンシップ・案件の生成は mock のため定型文が入る。佐野様のご指摘どおり、
確認いただきたいのは**そのあと画面で直せること**である。

---

## 5. 体験が終わったら

- `DEMO_ACCOUNT_ROLE` を `VIEWER` に戻す（または体験用アカウントを無効化する）
- ダミーの対象者を削除する
- 実データを入れる環境では `AI_PROVIDER` を `mock` か `bedrock` にする
