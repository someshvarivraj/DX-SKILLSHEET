# Questions on the specification

*English version. The Japanese original is `SPEC-QUESTIONS.md` — send that one to Sano-san.*

These came out of checking the specification (`IITスキルシート生成システム_仕様書_0910.pdf`)
against the form definition (`create_iit_form_2026.gs`) line by line.

Every item says what we implemented for now, so nothing is blocked while we wait for an
answer. Anything here can be changed once a decision is made.

---

## A. Which questions appear on the sheet

### A-1. The same question feeds two different fields

**What we found**

§6.2 「希望職種」(Desired job type) and §6.7 「興味ある分野」(Fields of interest) both name
**G-1-1A〜C** as their source. As written, the sheet would print identical content in two
places.

Looking at the sample sheets, 希望職種 contains entries like "ソフトウェア開発、組込み系・
ロボティクス開発…", which look closer to **I-1-3** (jobs they want to try at a Japanese
company) than to G-1-1.

**What we need to know**

Should one of them change? Two plausible readings:

- 希望職種 = I-1-3, 興味ある分野 = G-1-1A〜C
- 希望職種 = G-1-1A〜C, 興味ある分野 = G-1-4 (future career goals)

**What we did**

Followed the specification literally — both use G-1-1A〜C. The source is editable from the
admin screen, so correcting it needs no code change.

---

### A-2. Questions the form collects that chapter 6 never places

These are asked on the form but are not assigned to any field in chapter 6:

| Question | Content |
|---|---|
| A-1-3 | Gender |
| A-1-5 | Current location |
| B-1-6 / B-2-6 / B-3-5 | Academic scores (CGPA / percentage) |
| C-1-2 | Planned next JLPT sitting |
| C-1-3 | Japanese study history |
| H-1-1 | Student groups, project leadership |
| H-1-2 | Presentations, awards, team management |
| J-1-1 | Additional notes |
| J-1-2 | GitHub / portfolio link |
| J-1-3 | Hobbies |

**What we need to know**

Are these intentionally left off the sheet? Two look like oversights rather than
decisions:

1. **Hobbies (J-1-3).** §9.1 lists 趣味 in the table of writing tone, and §9.3 is entirely
   about how the hobbies field should be written (noun form: 読書, not 本を読むこと).
   Chapter 9 legislates a field that chapter 6 never creates.
2. **Academic score (CGPA).** The glossary includes "CGPA（累積成績平均）" with a note that
   the scale differs from a Japanese GPA. Putting it in the glossary implies it is
   displayed somewhere.

**What we did**

Created two sections — リーダーシップ・課外活動 and その他 (hobbies, GitHub, notes) — and set
both to **hidden by default**. Turning them on is one checkbox. Gender, current location,
academic scores and the Japanese study history have no field yet.

---

### A-3. Two different rules for empty fields

- §8.3: "Keep the field label and leave the content blank."
- §6.4: "Hide a field when every option is 'none'."

For the technical skills section these say opposite things.

**What we need to know**

When someone selects only 使用経験なし for CAD, CAE, electrical control or materials
characterisation, should the sheet print the label with an empty value, or omit the row
entirely?

**What we did**

Read §6.4 as the specific instruction for technical skills and **omit empty rows
entirely**, including for prose fields. This matches the sample sheets, which show no
blank rows.

---

## B. The Japanese ability section

### B-1. Is the interview note printed?

§6.10 opens by saying only two things appear on the sheet — the qualification with its
date, and the description generated from the scores. But the table in the same section
also lists 面談・面接での所見 (interview observations) as a manual-entry field.

**What we need to know**

Is the interview note printed on the PDF, or is it an on-screen memo only?

**What we did**

Set it to print, with a one-click switch to exclude it. The raw scores are not printed,
as instructed.

---

### B-2. Confirmation of the pass criteria we implemented

The Japanese ability paragraph is generated **by rule, not by AI**, per chapter 10. The
same input always produces the same sentence.

Pass criteria used (from §10.1) — please confirm:

| Level | Pass mark | Section minimum |
|---|---|---|
| N1 | 100 | 19 in each of three sections |
| N2 | 90 | 19 in each of three sections |
| N3 | 95 | 19 in each of three sections |
| N4 | 90 | 38 language knowledge + reading, 19 listening |
| N5 | 80 | 38 language knowledge + reading, 19 listening |

A candidate who clears the total but falls below any section minimum is treated as having
failed, and the generated text says so. Where one section only just clears its minimum,
the text mentions that too.

---

## C. Operational points

### C-1. Employee number to email mapping

§15 raises this already: the form collects email addresses, and employee numbers are held
separately.

**What we need**

A mapping of employee number to email address, as a CSV or similar. With it, the link is
made automatically at import.

**What we did**

Employee number is a manually entered field for now.

---

### C-2. Photo dimensions

**What we need to know**

Is there a required size or aspect ratio for the profile photo? The sample sheets show a
portrait image of roughly 3:4.

**What we did**

Accept JPEG and fit it to a portrait frame. If a specific size is required we will crop
to that ratio at upload.

---

### C-3. The order of "finalise" and "export"

- §11.1: "Only versions with the status FINAL can be exported."
- §5.8: "Save automatically before generating the PDF."

If saving creates a new version, the automatic save before export would produce a draft,
which contradicts §11.1.

**What we did** — please confirm this sequence is what was intended:

1. Editing always writes to a draft version, with per-field history on every save.
2. 確定する promotes that version to FINAL. If any field is still unchecked it refuses and
   lists them.
3. PDFs are exported from the FINAL version.
4. Editing after finalising leaves the finalised version intact and starts a new draft.

---

### C-4. One display preset, or several?

§5.5 says one set of settings is enough for now, but anticipates wanting named sets
("for company A", "for company B") later.

**What we did**

The data model supports several from the start — the display flag and order live in a
separate table from the record itself, exactly as §5.5 asks. The screen currently shows
only the default set. Tell us if the multi-set screen is needed in phase 1.

---

## D. Phase 3 — self-service by the recruits

Chapter 14 schedules this for later, but Sano-san's reply called it the most important
goal, so **it is built in phase 1**.

**What we did**

- Four roles: administrator, sales, engineer (the person themselves), viewer (demo).
- An engineer edits only their own internship and project records, and can add a new one —
  the case Sano-san described, where someone finishes at a customer site and adds that
  experience themselves.
- 確認を依頼する sets the sheet to 確認待ち.
- The administrator reviews and finalises.
- Versioning and per-field history were built from the start, so none of this had to be
  retrofitted.

**What we need to know**

1. Is "internships and projects" the right editable scope for the person themselves?
   Should hobbies, or their Japanese study progress, also be theirs to maintain?
2. Should the administrator get an **email notification** when someone submits?
3. You mentioned extending this to Japanese employees eventually. That case needs no
   English-to-Japanese translation — changing a field's processing type from 生成 to
   転記 or 手入力 on the admin screen covers it, with no code change.

---

## E. For reference: how the yearly form change is absorbed

Since this was the central requirement, here is what was built for it.

1. **The question list is read from the form definition script automatically.** Give us
   `create_iit_form_2027.gs` and one command regenerates the catalogue — question IDs,
   answer types, options, grid rows and columns. We verified this reads all 113 questions
   of the 2026 script correctly.

2. **Where each question lands on the sheet is a screen setting, not code.** Add a row for
   a new question, or change a source ID if a question is renumbered. No code change, no
   redeployment.

3. **Questions not assigned to any field are listed as "unassigned"** on both the import
   screen and the definition screen, so a change to the form cannot pass unnoticed.

4. **The AI instructions are editable from the screen too**, so tuning the output does not
   require a developer.
