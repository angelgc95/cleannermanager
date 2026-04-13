# Scheduled Operations

Cleaner Manager relies on GitHub Actions to trigger three Supabase Edge Functions in production:

- `sync-ics`
- `dispatch-notifications`
- `run-scheduled-payouts`

Those workflows live in `.github/workflows/` and call the production project at `https://qevpbbaxelsckmlcnvrb.supabase.co`.

## Required Secrets

The same shared secret must exist in both places below:

- GitHub Actions secret: `SUPABASE_CRON_SECRET`
- Supabase function environment variable: `CRON_SECRET`

The workflows send the GitHub secret as the `x-cron-secret` header. The three Edge Functions reject cron traffic unless that value matches `CRON_SECRET`.

## Production Setup

1. Create a strong shared secret.
2. Add it to the GitHub repository as `SUPABASE_CRON_SECRET`.
3. Add the same value to the deployed Supabase functions as `CRON_SECRET`.
4. Deploy the updated functions and database migration.

Example Supabase CLI commands:

```sh
supabase secrets set CRON_SECRET="your-shared-secret" --project-ref qevpbbaxelsckmlcnvrb
supabase db push --project-ref qevpbbaxelsckmlcnvrb
supabase functions deploy sync-ics --project-ref qevpbbaxelsckmlcnvrb
supabase functions deploy dispatch-notifications --project-ref qevpbbaxelsckmlcnvrb
supabase functions deploy run-scheduled-payouts --project-ref qevpbbaxelsckmlcnvrb
```

## Current Schedules

- `Run iCal Sync`: every 15 minutes
- `Dispatch Notifications`: every 5 minutes
- `Run Scheduled Payouts`: every 5 minutes

## Manual Verification

Each workflow also supports `workflow_dispatch`, so after secrets are added you can run them manually from GitHub Actions and confirm:

- `sync-ics` returns a successful response and creates, updates, or removes auto events as expected
- `dispatch-notifications` processes due notifications without auth errors
- `run-scheduled-payouts` skips or processes hosts individually instead of failing the whole run on one bad host

## Troubleshooting

- `401` or `403` from a scheduled workflow usually means `SUPABASE_CRON_SECRET` and `CRON_SECRET` do not match.
- A successful GitHub workflow with no operational changes usually means the function ran but found nothing due.
- If the workflows succeed but new schema fields are missing, deploy the migration before re-running the jobs.
