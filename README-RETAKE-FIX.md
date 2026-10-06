# Assessment Retake Fix

Retakes are controlled by `lms_assessments.allow_retake`.

- `true` = a student who already submitted may start another attempt.
- `false` = the previous attempt remains final and the student sees the result/status page.
- Rejected attempts can be resubmitted by the existing workflow.

To enable retake for an existing assessment, use the Supabase SQL Editor:

```sql
update public.lms_assessments
set allow_retake = true,
    updated_at = now()
where title = 'Unit-I — 15 Question Assessment';
```

Or edit the assessment in the Admin > Assessment Management screen and enable **Allow retake**.

The server-side `start-assessment` function still enforces this setting, so changing only the student UI cannot bypass the rule.
