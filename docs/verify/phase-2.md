# Phase 2 動作確認

```bash
npm run check
cd apps/site-template
npm run dev
npm run screenshots
```

確認するもの:

- `site.config.json` の `template` を `classic`, `caseFirst`, `singlePage` に変えると構成が変わる
- `theme` を `honestNavy`, `livelyOrange`, `premiumGreen` に変えると配色が変わる
- 施工事例が0件でも「施工事例は準備中です」が表示される
- 375px, 768px, 1440px のスクショで電話・LINE導線が見える
- `/og.svg` が表示され、HTMLに LocalBusiness の構造化データが入っている
- CIで Performance, SEO, Accessibility の Lighthouse 95点以上を確認する
