# Edge Function deployment

This build has self-contained Edge Function source files. Each function's `index.ts` no longer depends on a separate `_shared.ts` file, so the functions can be deployed from the Supabase Dashboard or CLI as individual functions.

Recommended CLI deployment from the project root:

```bash
supabase functions deploy submit-assessment
supabase functions deploy start-assessment
supabase functions deploy save-assessment-answers
supabase functions deploy start-learning-session
supabase functions deploy heartbeat-learning-session
supabase functions deploy record-login
```

If using the Supabase Dashboard, deploy/paste the complete `index.ts` for each function. Do not paste only a partial file.

The `submit-assessment` function also fixes an initialization-order bug where `assessmentSession` was referenced before declaration.
