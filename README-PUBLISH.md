# AI&DS-ML LEARNING — Final Release

Modern responsive learning-platform build with a Supabase-backed production data layer and Vercel frontend hosting.

## 1. Publish to Vercel
Use **web/** as the Vercel Root Directory.

Deploy these files/folders from `web/` only:
- `index.html`
- `css/`
- `js/`
- `vercel.json`

The browser configuration contains only the public project URL and publishable API key. Never place a secret/service key in `web/js/`.

## 2. Deploy the backend
The `supabase/` folder is NOT the Vercel Root Directory. Deploy it separately to your Supabase project.

Edge Functions:
- `admin-create-user`
- `admin-update-user`
- `admin-delete-user`
- `admin-review-attempt`
- `submit-assessment`

Run the database SQL in this order when installing/updating a project:
1. `00-production-schema.sql`
2. `01-curriculum.sql` (only for an empty/new curriculum)
3. `07-production-hardening.sql`
4. `08-verify-production.sql` (read-only verification)

Do not re-run the curriculum seed on a populated production database unless you intentionally want to insert duplicate/seed content and the SQL has been designed for that state.

## 3. Current UI changes
- New indigo / teal learning-platform visual system.
- Responsive layouts for desktop, tablet and mobile.
- Global search for courses, topics, assessments, syllabus, quizzes and (for admins) users.
- Admin Students page includes user search plus role/activity filters.
- Vendor/backend branding is removed from visible frontend copy.
- Tables, forms, builders and dashboard cards adapt to small screens.

## 4. Before publishing
- Confirm the intended administrator account(s) are the only admin profiles.
- Remove any temporary/test Auth users that you do not intend to keep.
- Upload the real syllabus through Admin.
- Deploy all five Edge Functions and verify their Invocations/Logs.
- Run `08-verify-production.sql` and confirm the Auth/Profile and RLS/function checks.
- Test Admin Add User, Edit/Reset Password, Delete User, Assessment Submit, Report Review and Syllabus upload/view.


## Model Training Practice

Student navigation now includes **Model Training Practice**. The page links to the verified NextLeap Jupyter Notebook workspace:
https://nextleap.app/online-compiler/jupyter-notebook

The page guides students to open Jupyter Notebook, choose **Python (Pyodide)**, create a code cell, run the sample ML model, and experiment with model settings. The example uses scikit-learn's built-in Iris dataset and a Decision Tree classifier.

`web/js/training.js` contains the training-page UI and sample code. It does not require Supabase database changes because notebook execution happens on the external practice platform.

Before publishing, keep `supabase/` out of the Vercel Root Directory. Deploy only `web/` to Vercel and deploy the Edge Functions separately to Supabase.

## Production LMS hardening — assessment timers + learning analytics

Apply the migrations in this order:

1. `supabase/00-production-schema.sql`
2. `supabase/01-curriculum.sql`
3. `supabase/07-production-hardening.sql`
4. `supabase/09-assessment-timers-and-learning-time.sql`
5. `supabase/08-verify-production.sql`

Deploy all Edge Functions under `supabase/functions/`, including:

- `start-assessment`
- `submit-assessment`
- `start-learning-session`
- `heartbeat-learning-session`
- `save-assessment-answers`
- `record-login`
- existing admin functions

### Assessment security

- `deadline` is the calendar cutoff.
- `duration_minutes` is the countdown after the student starts.
- The server creates the assessment session and calculates `expires_at`.
- The browser timer is only a display/auto-submit trigger; the server validates expiry.
- Answers are persisted to the assessment session as the student selects them, so refresh/crash recovery can use the server copy.
- Final attempts are inserted by the `submit-assessment` Edge Function; authenticated clients are explicitly denied direct INSERT.
- Correct answers are loaded only by the server during scoring. Student question data comes from the published-question RPC and must not include `correct_index`.

### Learning analytics

- Login events are recorded separately.
- Topic sessions contain `unit_id` and `topic_id`.
- Heartbeats calculate elapsed time from server timestamps instead of trusting a client-provided duration.
- Admin Learning Activity shows total course time, session count, last active, last login, unit time and topic time.
