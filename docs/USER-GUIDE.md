# User guide

How to run the application, what every screen does, and how to check that the one thing
the client actually cares about — surviving next year's form change — really works.

---

## 1. Starting it each day

```bash
cd ~/Documents/skill-sheet/dx-skillsheet

brew services start postgresql@16   # only if it is not already running
npm run dev
```

Open <http://localhost:3000>.

To stop: `Ctrl+C` in the terminal. To stop the database: `brew services stop postgresql@16`.

---

## 2. Logging in

There are no passwords. You enter your email address, the system sends a one-time link,
you click it. This is what the specification asks for (§12.2), and it means there is no
password to leak or reset.

### 2.1 Which address do I use?

The one in `SEED_ADMIN_EMAIL` in your `.env` file. Out of the box that is:

```
admin@example.com
```

Only addresses on the domains listed in `AUTH_ALLOWED_EMAIL_DOMAINS` are accepted. Your
`.env` allows `morabu.com` and `example.com`. Anything else is refused before the system
even looks the user up.

### 2.2 Where does the link go?

**Not to a real inbox.** Your `.env` has `MAIL_TRANSPORT=console`, so the email is printed
into the terminal where `npm run dev` is running. Look for a block like this:

```
─────────────── MAIL (console transport) ───────────────
To:      admin@example.com
Subject: スキルシート管理システム ログインリンク

スキルシート管理システムへのログインリンクです。

http://localhost:3000/auth/verify?token=xxxxxxxxxxxxxxxx

このリンクは15分間有効で、一度使用すると無効になります。
────────────────────────────────────────────────────────
```

Copy the `http://localhost:3000/auth/verify?token=...` line into your browser.

The link expires after 15 minutes and works only once. Request a new one if it fails.

### 2.3 Logging in as the demo account

The demo account is the one account that does use a password, because it is shared
between several people trying the system out (§12.3). It is **read-only** — it cannot
edit, finalise or export.

On the login page, below the email box, there is a second block titled
**デモ利用者**. Enter the password from your `.env`:

```
DEMO_ACCOUNT_EMAIL="demo@example.com"
DEMO_ACCOUNT_PASSWORD="demo-password"
```

So the password to type is `demo-password`.

**If that block is not visible**, check that your `.env` contains
`NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED=true` and restart `npm run dev` — variables beginning
`NEXT_PUBLIC_` are read when the server starts, not on each request.

Use the demo account to see what a colleague trying the system would see: everything is
visible, every edit control is gone.

### 2.4 Adding more people

Sign in as admin, go to **利用者** in the top navigation, and press **＋ 利用者を追加**.

| Role | What they can do |
|---|---|
| 管理者 ADMIN | Everything |
| 営業 SALES | Edit sheets, choose which records appear for each recipient company, export PDFs |
| 技術者（本人） ENGINEER | Edit **only their own** internship and project records, submit for review |
| 閲覧のみ VIEWER | Read-only |

An ENGINEER account must be linked to a person using the 紐付ける対象者 dropdown — that is
how the system knows whose sheet they own. The dropdown only lists people who already
exist, so import the responses first.

To test the engineer experience: import the sample data (below), then create a user with
your own address, role 技術者, linked to Rohan Deshmukh. Log in with that address and you
will land on **自分のスキルシート** instead of the list.

---

## 3. Loading test data

No real questionnaire responses exist yet — the specification says so (§2.3) and asks us
to make our own. A sample file is included:

```bash
npm run sample:responses      # regenerates it; it is already in the repo
```

This writes `data/sample-responses.csv`: three people with the same mix of backgrounds
the client expects this year — a mechanical engineer, a materials engineer, and a
software engineer. The column headers are exactly what the real Google Form response
sheet produces, including one column per row for the three grid questions, so importing
it exercises the real code path rather than a simplified one.

The three people are deliberately different from each other:

| Person | Why they are in the sample |
|---|---|
| Rohan Deshmukh | Mechanical. Fills the CAD and CAE fields. JLPT N3 with weak listening — exercises the rule-based description |
| Ananya Iyer | Materials. Fills SEM/XRD/Thermo-Calc, has a published paper — exercises the research output section |
| Karthik Menon | Software. No JLPT at all, no CAD — exercises the "leave empty fields empty" rule |

---

## 4. The main flow, start to finish

### Step 1 — Import

**取り込み** in the navigation.

1. Choose `data/sample-responses.csv`.
2. Press **内容を確認する** first. This does not write anything. It shows:
   - how many columns matched a question,
   - **未割当の列** — columns that exist in the file but are not used by any field,
   - which rows are new people and which already exist.
3. Press **取り込む**. Leave **新規の対象者は取り込み後にすべての項目を生成する** ticked so
   the sheets are populated immediately.

The first import takes a little while — it generates every field for every person.

What just happened: the raw answers were stored unchanged in the import layer, which is
never modified again, and a working copy was created from them. On a second import the
system will not overwrite anything; it flags the people whose answers changed so you can
review the differences.

### Step 2 — Review and edit

**対象者一覧** now lists three people. Each row shows the status and how many fields are
still unchecked. Click a name.

The editor shows every section. For each field:

| Control | What it does |
|---|---|
| **保存** | Saves your manual edit. Appears once you change the text |
| **再生成** | Re-runs the processing for that field alone |
| **指示して再生成** | Type an instruction such as "もう少し短く" and regenerate just this field with it |
| **原文を表示** | Shows the original English answer next to the Japanese, so you can check the translation |
| **履歴** | Every past value with who changed it and when. Any entry can be restored |
| **確認済み** | Tick when you have checked the field. Untick-by-default is deliberate — AI output is never assumed correct |
| **ロック** | Locks the field. Bulk regeneration will skip it |
| **PDFに出力** | Only on fields the specification allows to be switched per recipient company |

At the top of each section there is **セクション一括生成**, which regenerates the whole
section but never touches locked fields.

Warnings appear under a field automatically: polite form where plain form is required,
full-width numerals, text outside the target length, glossary terms the system does not
recognise.

The toolbar at the top shows **未入力の一覧** — every field with no content, so nothing is
missed before you go back to the person with questions.

> **Note:** the Japanese text you see now says 【AI未接続・仮出力】. That is correct — no AI
> service is connected yet. Everything else is real: the copied fields, the glossary
> substitutions, the JLPT description, the layout, the PDF. Once Bedrock is switched on,
> press 再生成 and real Japanese replaces the placeholder.
>
> The placeholder text for these fields also shows raw question codes in brackets, e.g.
> `[C-1-1] N2`. That's expected too — the mock provider just echoes back the exact text a
> real AI would have received, so you can see what it will look like once one is connected.
> It only affects fields that need written prose (対応言語, ワークスタイル, and similar); copied
> or dictionary-matched fields like 希望業界 are unaffected and already show their final text.

### Step 3 — Choose which internships and projects appear

Open the インターンシップ section. Each record has a **スキルシートに表示** checkbox. Tick at
most three — the system refuses a fourth, as the specification requires.

This is how one person's sheet is tailored for different companies without deleting
anything: everything stays stored, only the selection changes.

You can also add a record from this screen with **＋ 追加** — this is the path an engineer
uses to add a new site experience.

### Step 4 — Finalise

Press **確定する** in the toolbar.

If any field is still unchecked, it refuses and lists exactly which ones. That is
intentional: the specification forbids exporting a draft. Tick 確認済み on those fields,
or use the list to find them, then finalise again.

### Step 5 — Export the PDF

Press **PDFをダウンロード**.

First time only, install a browser for the renderer:

```bash
npx playwright install chromium
```

The PDF is A4 portrait with the privacy notice at the top, the company name and date in
the footer, and page numbers in `n / N` form. The file is named
`Rohan_Deshmukh_20260916.pdf` — name and date, no employee number.

Check **プレビュー** before exporting: the preview and the PDF are generated from the same
HTML by design, so what you see is what you get.

Every export is recorded. **操作ログ** shows who exported whose sheet, when, and lets you
download the exact file again — so you can always answer "what did we send that company?"

---

## 5. How to check the main feature

Everything above is ordinary skill-sheet software. The thing Sano-san actually asked for
is that **next year's form change must not require rebuilding the application**. Here is
how to prove it works. These take about ten minutes.

### Test A — change where a field gets its content, with no code change

1. Go to **項目定義**.
2. Open 個人情報 → 出身地.
3. Change 取得元の設問ID from `A-1-6` to `A-1-5` and press 保存.
4. Go back to a person, press 再生成 on 出身地.

The field now builds from the current-location answer instead of the hometown answer.
Nothing was recompiled and nothing restarted. Change it back afterwards.

### Test B — add a field that does not exist yet

1. **項目定義** → the その他 section → **＋ 項目を追加**.
2. Code `oth_english_score`, name `英語スコア`, processing 転記, source `C-1-4`.
3. The その他 section is hidden by default — press セクション設定 and tick
   スキルシートに出力する.
4. Go to Rohan and press セクション一括生成 on その他.

His IELTS score now appears, and it will appear in the PDF. A new question became a new
field on the sheet without a developer.

### Test C — catch a question nobody assigned

**項目定義** shows a yellow panel at the top listing questions the form collects that no
field uses. This is the safety net for a form revision: if next year adds three questions,
they show up here instead of being silently dropped.

### Test D — the real thing: a changed form

1. Copy `data/create_iit_form_2026.gs` to `data/create_iit_form_2027.gs`.
2. Edit the copy — add a question, for example inside section D:
   ```js
   checks(form, 'D-1-15. 生成AIツールの使用経験／Generative AI Tools', null,
     ['ChatGPT', 'GitHub Copilot', 'Claude', '使用経験なし／None'], false, true);
   ```
3. Run:
   ```bash
   npm run form:parse -- data/create_iit_form_2027.gs 2027
   ```
4. It reports the question count — now 114 instead of 113.

The parser reads the script by running it, so it picks up whatever the form actually
defines, including the answer options and the grid rows. Import that revision, and
`D-1-15` appears in the unassigned list until someone decides where it belongs.

### Test E — the glossary keeps wording stable

1. Go to **対訳辞書**, choose 専攻名, and search for `Mechanical`.
2. Change the Japanese from 機械工学 to 機械工学（メカニカル）and save.
3. Regenerate the 専攻名 field on Rohan's education row.

It changes everywhere, immediately, for everyone. The AI is never asked to translate a
major name, so the same major can never come out two different ways on two sheets.

The state-to-region table works the same way, which is the point the glossary file's own
note makes: letting an AI decide had produced the same Indian state in two different
regions on different sheets.

---

## 6. Screen reference

| Screen | Purpose |
|---|---|
| **対象者一覧** | Everyone, with status (下書き / 確認待ち / 確定), version number and unchecked-field count |
| **スキルシート編集** | The field-by-field editor described in section 4 |
| **プレビュー** | The sheet exactly as it will print |
| **取り込み** | Import responses; preview before writing; import history |
| **項目定義** | Sections and fields: order, processing, source questions, AI prompts, PDF visibility. The extensibility mechanism |
| **対訳辞書** | Universities, majors, degrees, states with their region, technical terms with the explanation added on first use |
| **利用者** | Accounts and roles |
| **操作ログ** | Logins, views, edits, finalisations and PDF exports, with re-download |
| **自分のスキルシート** | What an ENGINEER sees: their own internships and projects only |

---

## 7. Things worth knowing

**AI output is never marked as checked.** A person has to tick 確認済み. This is why
finalising refuses when fields are unchecked — it is the mechanism that stops unreviewed
machine text reaching a customer.

**Empty answers stay empty.** If somebody answered "None", the field is blank rather than
invented. Karthik has no JLPT and no CAD experience — his sheet simply does not show
those rows.

**Locked fields survive regeneration.** Lock anything you have corrected by hand before
running a bulk regeneration.

**Company names and dates are never rewritten by AI.** They are copied, and you can edit
them by hand, but no regeneration will touch them.

**The JLPT paragraph is not AI.** It is computed from the score breakdown using the
official pass marks. Rohan passed N3 but his listening is comparatively weak, and the
generated sentence says so specifically rather than calling him "fluent". Same input
always produces the same sentence.

**Deleting a record is reversible.** It is hidden, not destroyed.

---

## 8. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Can't reach database server at localhost:5432` | PostgreSQL is not running. `brew services start postgresql@16` |
| Login page says the address is not allowed | The domain is not in `AUTH_ALLOWED_EMAIL_DOMAINS` in `.env` |
| Login link does nothing | It expired (15 minutes) or was already used. Request another |
| No demo block on the login page | Set `NEXT_PUBLIC_DEMO_ACCOUNT_ENABLED=true` in `.env` and restart `npm run dev` |
| PDF download fails | `npx playwright install chromium`, or set `CHROMIUM_PATH` in `.env` |
| PDF shows boxes instead of Japanese | The rendering browser has no Japanese font. Use system Chrome via `CHROMIUM_PATH` |
| Import says many columns are unassigned | The file came from a different form revision, or the headers were edited by hand |
| Generated text says 【AI未接続・仮出力】, with `[C-1-1]`-style codes inside it | Expected. `AI_PROVIDER=mock` just echoes the raw source text back. Switch to Bedrock when the account is ready |
| Want to start over | `npm run db:reset` — drops everything and re-seeds. All entered data is lost |
