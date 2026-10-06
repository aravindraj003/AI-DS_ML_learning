# Assessment Review

Deploy the new protected review function:

```bash
supabase functions deploy review-assessment
```

Students can review only their own submitted attempts. The review returns question text, selected answer, and correct answer after submission; it does not expose correct answers during an active assessment.
