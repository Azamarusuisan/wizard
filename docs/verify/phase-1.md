# Phase 1 動作確認

```bash
npm run check
```

確認するもの:

- `apps/web`, `apps/site-template`, `packages/pipeline`, `packages/shared` がある
- `supabase/schema.sql` に `leads`, `orders`, `sites`, `revisions`, `payments`, `events` がある
- `.env.example` に Supabase, Stripe, Inngest, Resend, LINE の値がある
- Stripe Checkout, Stripe Webhook, Inngest API のルートがある
