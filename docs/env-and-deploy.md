# 環境変数とVercel

`apps/web` と `apps/site-template` は Vercel で別プロジェクトにする。

1. `.env.example` の値を Vercel の `craftsite-web` に登録する。
2. 顧客サイトのプレビュー用に `craftsite-preview` を作り、`SITE_PREVIEW_BASE_URL` を `https://preview.craftsite.jp` にする。
3. Stripe Webhook は `/api/webhooks/stripe`、Inngest は `/api/inngest` を向ける。
4. Supabase SQL Editor で `supabase/schema.sql` を実行する。
