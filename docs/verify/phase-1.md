# Phase 1 動作確認

```bash
npm run check
```

確認するもの:

- `apps/web`, `apps/site-template`, `packages/pipeline`, `packages/shared` がある
- `supabase/schema.sql` に `leads`, `orders`, `sites`, `revisions`, `events` がある
- `.env.example` に Supabase, Inngest, Resend, LINE の値がある
- Inngest API のルートがある
