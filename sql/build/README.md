# UCIL — Consolidated Database Build

This folder is the **single source of truth** for the UCIL database. It replaces
the old `ucil-complete.sql` + `05_automation.sql` + `update1..update14` chain
(now archived in `../legacy/`). Every fix from those migrations is baked in.

## Run order (Supabase SQL Editor)

Run each file top-to-bottom, in order:

| File | Purpose | Required? |
|------|---------|-----------|
| `00_reset.sql`   | Drops all UCIL objects for a clean slate | Only if the DB already has UCIL objects |
| `01_schema.sql`  | Extensions, tables, indexes, views | ✅ required |
| `02_logic.sql`   | Helper functions, triggers, RPC utilities | ✅ required |
| `03_security.sql`| RLS policies, storage bucket + policies, grants | ✅ required |
| `04_automation.sql` | Settings, cron jobs, Edge-Function webhook triggers | ✅ required |
| `05_seed_demo.sql`  | Representative demo data | Optional (demo/staging only) |

## ⚠️ Before running `04_automation.sql`

Edit the two placeholder values near the top:

```sql
INSERT INTO public.settings (key, value) VALUES
  ('supabase_url',     'https://YOUR-PROJECT-REF.supabase.co'),
  ('service_role_key', 'PASTE_YOUR_FRESH_SERVICE_ROLE_KEY_HERE')
```

Use a **freshly rotated** service-role key (the old one was committed to git and
must be considered compromised). These values let cron jobs and DB triggers call
the Edge Functions server-side.

## After a full rebuild

Your Supabase Auth accounts are **not** touched by `00_reset.sql`, but the
`public.users` profile table is recreated empty. For each existing login, either:

- re-run sign-up in the app (the `handle_new_user` trigger recreates the profile), or
- insert the profile row manually:

```sql
INSERT INTO public.users (id, full_name, email, role, avatar_initials)
VALUES ('<auth-user-uuid>', 'Your Name', 'you@example.com', 'Compliance Lead', 'YN');
```

## What was fixed vs. the legacy chain

- **Metrics writes no longer fail.** `recalculate_metrics()` uses an explicit
  `WHERE` clause (the `supautils` guard rejects WHERE-less `UPDATE`), and the
  `metrics` table is a real singleton (unique index).
- **RLS reads restored.** `controls` / `evidence` / `gaps` are readable again and
  `evidence` inserts are allowed (the old chain dropped these policies).
- **`scan_info`** has `UNIQUE(scan_type)` so the scraper/eval cron upserts work.
- **Dead/contradictory migration steps removed** (tenant policies referencing a
  dropped function, `WHERE id = 1` on a UUID, `internal_policies` referenced
  before it existed, etc.).
