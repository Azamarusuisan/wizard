# 環境変数とVercel

`apps/web` と `apps/site-template` は Vercel で別プロジェクトにする。

1. `.env.example` の値を Vercel の `craftsite-web` に登録する。
2. 顧客サイトのプレビュー用に `craftsite-preview` を作り、`SITE_PREVIEW_BASE_URL` を `https://preview.craftsite.jp` にする。
3. Stripe Webhook は `/api/webhooks/stripe`、Inngest は `/api/inngest` を向ける。
4. Supabase SQL Editor で `supabase/schema.sql` を実行する。

## AIモデル

APIキーだけではAI生成を有効にしない。モデル名も明示する。

```env
ANTHROPIC_MODEL=claude-sonnet-4-6
OPENAI_VISION_MODEL=gpt-4.1-mini
```

未設定の場合はフォールバック生成で動かし、起動時に警告を1行出す。

## 生成ワーカー

`site.generate` はリポジトリ内で `npm run build` と Playwright を動かすため、Vercel サーバレス関数では運用しない。当面は Mac mini を生成ワーカーにする。

```bash
npm install
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
npm run dev --workspace @craftsite/web
```

件数が増えたら同じコマンドをVPSへ移す。
