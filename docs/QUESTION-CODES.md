# Question codes (A-1-6, E-x-2, G-1-7, …)

What these codes are, where they come from, and how a code like `A-1-6` ends
up as a value on the printed skill sheet. Written because the codes show up
in several unrelated-looking places (the admin screen, the database, error
messages, this codebase) and it isn't obvious at a glance that they're all
the same thing.

## The short answer for A-1-6

`A-1-6` is one question on the Google Form: **出身地（州・都市）／ Hometown
(State and City)**. It is question 6 in block 1 of section A (personal
information). On the skill sheet it feeds the **出身地 (Hometown)** field —
see `hometown_with_region` in `src/lib/rules/index.ts`, which combines the
raw answer with the glossary's state→region table to print something like
「パラディップ・オディシャ州（東インド）」. The full path from form to sheet is
below.

## What the code means

Every question on the Google Form is prefixed with a code of the form:

```
<SECTION LETTER>-<block number>-<question number><optional letter/suffix>
```

Examples: `A-1-1`, `B-1-2(B)`, `E-2-6`, `G-1-1A`.

- **Section letter** — a rough topic grouping (table below).
- **Block number** — groups related questions. Mostly `1`, but sections that
  repeat data use it to mean "occurrence #N" — `E-1-*` is internship #1,
  `E-2-*` is internship #2; `B-1-*`/`B-2-*`/`B-3-*` are three education
  entries (undergrad / master's / other).
- **Question number** — position within the block.
- **Optional suffix** — `(B)`/`(M)` distinguish degree-level variants
  (Bachelor's vs Master's), a bare letter (`G-1-1A/B/C`) distinguishes
  ranked choices (1st/2nd/3rd priority).

This is not a convention we invented — it's already in the question titles
on the actual Google Form (`create_iit_form_2026.gs`), e.g. the form
literally has a question titled `"A-1-6. 出身地（州・都市）／Hometown (State and
City)"`. We just extract the code from the title text.

### Section letters

| Letter | Topic | Count (2026 form) | Example |
|---|---|---|---|
| A | Personal information | 8 | A-1-1 Name, A-1-6 Hometown, A-1-7 Dietary |
| B | Education | 16 | B-1-1 Education level, B-1-2 Degree, B-3-5 Score |
| C | Japanese language / JLPT | 12 | C-1-1 JLPT level, C-2-2 Total score |
| D | Technical skills | 14 | D-1-1 Programming languages, D-1-14 Top 5 skills |
| E | Internships (repeats ×2) | 20 | E-1-2 Company, E-2-6 Summary |
| F | Projects (repeats ×2) | 18 | F-1-1 Title, F-2-5 Summary |
| G | Job/industry preferences | 11 | G-1-1A First-choice role, G-1-7 Assignment openness (grid) |
| H | Leadership / publications | 8 | H-1-1 Student groups, H-2-1 Publications |
| I | Interest in Japan | 3 | I-1-1 Why Japan, I-1-3 Jobs wanted |
| J | Misc / optional | 3 | J-1-2 GitHub link, J-1-3 Hobbies |

(Full list with Japanese/English titles: `prisma/seed/form-questions-2026.json`,
or open **管理 → 項目定義** in the app.)

## Where codes come from (not hand-typed)

Codes are **not** entered by hand anywhere in this app. They're extracted
automatically by parsing the actual Google Apps Script that builds the form:

```
npm run form:parse -- ./create_iit_form_2026.gs 2026
```

This runs `scripts/parse-form-script.ts`, which executes the `.gs` file
against a stub of the `FormApp` API (so no Google account or network call is
needed) and, for every question, pulls the code straight out of its title
with a regex (`extractCode()` in that file):

```
"A-1-6. 出身地（州・都市）／Hometown (State and City)"  →  code: "A-1-6"
```

The result is written to `prisma/seed/form-questions-2026.json` (113
questions for the 2026 form) and, on import, becomes rows in the
`FormQuestion` table. **This is the mechanism for next year's form change**:
drop in `create_iit_form_2027.gs`, re-run the command, import the new JSON
from the admin screen — no code changes, per spec §4/§4.1.

**Easy to conflate, so to be explicit: the `.gs` file only builds the
form's questions. It has nothing to do with collecting or exporting
answers.** Once an engineer submits the form, Google Forms itself — not
this app, not the script — automatically drops that submission into a
linked "Form Responses" Google Sheet, one row per person. Getting that
into this app is a separate, manual step: open the Google Sheet, **File →
Download → Comma Separated Values (.csv)** (or **Microsoft Excel
(.xlsx)**), then upload that downloaded file on the 取り込み (Import)
screen. The `.gs` script is only ever touched again if next year's
question set changes.

## Where codes are used — the full path from form to printed sheet

```
1. Google Form question               "A-1-6. 出身地（州・都市）／Hometown..."
       │  (npm run form:parse)
       ▼
2. FormQuestion row (DB)               code: "A-1-6", titleJa, titleEn, type, …
       │
       │  ── an engineer fills out the Google Form ──
       │     Google Forms auto-collects every submission into a linked
       │     "Form Responses" Google Sheet, one row per person, in real
       │     time. This is a built-in Google Forms feature — the .gs
       │     script is NOT involved here, and no one has to run anything.
       │
       │  ── an operator downloads that sheet as a file ──
       │     In the Google Sheet: File → Download → Comma Separated
       │     Values (.csv) or Microsoft Excel (.xlsx). That downloaded
       │     file is what gets uploaded on the 取り込み (Import) screen.
       ▼
3. Spreadsheet export (CSV/XLSX)       column header: "A-1-6. 出身地（州・都市）..."
       │  (src/lib/import/match.ts — matched by TEXT, code is just the
       │   fastest/most-reliable signal, so reordering the form doesn't
       │   break import)
       ▼
4. FormResponse.answers (DB, JSON)     { "A-1-6": "Odisha, Paradeep", ... }
       │  read-only from here on (§5.1) — this is the permanent import record
       ▼
5. SheetFieldSource.questionCode       field "hometown" declares sources: ["A-1-6"]
       │  (prisma/seed/sheet-definition.ts — editable from
       │   管理 → 項目定義 without touching code)
       ▼
6. processField() / collectSourceValues()   src/lib/processing/pipeline.ts
       │  pulls ctx.answers["A-1-6"], runs the field's processing type
       │  ("hometown" is RULE_BASED → hometown_with_region() in
       │   src/lib/rules/index.ts)
       ▼
7. FieldValue.valueJa (DB)             "パラディップ・オディシャ州（東インド）"
       │
       ▼
8. Printed on the skill sheet          出身地: パラディップ・オディシャ州（東インド）
```

Step 5 is the one place a person actually configures which code(s) feed
which printed field — everything before and after it is mechanical. That's
the field-definition screen (`管理 → 項目定義`), backed by
`src/components/admin/field-definition-table.tsx`.

## Two wrinkles worth knowing

**Repeating sections use an "x" placeholder.** Internships and projects can
have several entries per person (`E-1-*` = internship #1, `E-2-*` =
internship #2, up to 10). Rather than writing a separate field definition
for each occurrence, the source code carries a placeholder: a field might
declare `sources: ["E-x-2"]`, meaning "question 2 of whichever internship
block this record came from." `resolveSourceCode()` in
`src/lib/processing/pipeline.ts` swaps the `x` for the record's actual
prefix (`E-1`, `E-2`, …) at read time. Education (`B-1`/`B-2`/`B-3`) instead
uses three genuinely distinct question numbers per level, so a field can
list all three explicitly and the pipeline picks whichever one matches the
record.

**Grid questions carry a row label.** A few questions (`G-1-7`, `G-1-8`,
`G-1-9`) are grid/matrix questions with several sub-rows — e.g. "How open
are you to being assigned outside your major?" asked once per possible
reassignment. In the exported spreadsheet each row becomes its own column,
named `"G-1-7. 専攻外分野への配属許容度 [機械専攻 → 土木・インフラ設計]"`. The
part in brackets is the row label; `splitGridSuffix()` in
`src/lib/import/match.ts` pulls it out, and the answer is stored as
`{ "G-1-7": { "機械専攻 → 土木・インフラ設計": "積極的に希望する", ... } }` rather
than a plain string.

## Where to look things up

| Question | Look here |
|---|---|
| What does question X-Y-Z ask, in Japanese/English? | `prisma/seed/form-questions-2026.json`, or 管理 → 項目定義 in the app |
| Which printed field does a question feed? | `管理 → 項目定義` (admin screen) — or `prisma/seed/sheet-definition.ts` for the original seed |
| Is a question unused/unassigned? | Import screen and 項目定義 screen both list "未割り当ての設問" (unassigned questions) — spec §5.3 |
| How is a specific field computed from its source(s)? | `src/lib/processing/pipeline.ts` (`processField`), and for rule-based fields, `src/lib/rules/index.ts` |
| Raw answers for one person, as imported | `FormResponse.answers` in the database, or the admin screen's diff view on re-import |
