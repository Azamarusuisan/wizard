# Phase 3 動作確認

```bash
npm install
npm run check
npm run phase3:dummy
npm run phase3:serve
npm run phase3:gate
npm run build --workspace @craftsite/site-template
npm run build --workspace @craftsite/web
```

確認するもの:

- 入力が空でも `generateSite({})` がプレビューURLまで返る
- 写真は最大20枚に制限され、`sharp` で回転補正・リサイズ・明るさ補正・WebP変換される
- `OPENAI_API_KEY` がある場合は写真を Vision で分類し、施工事例キャプションを保存する
- 写真が0件または不合格ならストック画像に戻る
- Claude出力は `site.config.json` 相当のJSONに限定し、禁止語を機械チェックする
- AI生成物と失敗ログは `ai_artifacts` / `generation_logs` に保存される
- ビルド後に電話リンク、電話番号、LocalBusiness、OGPを機械チェックする
- ビルド後にリンク切れ、ページ内リンク、ローカル画像・CSSの存在を機械チェックする
- ビルド後に375px/768px/1440pxスクショを撮り、OpenAIレビュー結果を保存する
- OpenAIレビューに指摘があればClaudeへ渡して `site.config.json` を修正し、最大2周まで再ビルドする
- `site.generate` は失敗時に注文を `failed` にし、オーナーへLINE/メール通知する
- 生成完了時はプレビューURLを顧客メール/LINEへ送る
- `/admin/generations` から注文IDを指定して手動再実行できる
- 生成が15分を超えた場合はオーナーへ通知する

オーナー確認:

- `npm run phase3:dummy` の `photos-rich`, `photos-three`, `photos-zero` を開く
- 確認時は別ターミナルで `npm run phase3:serve` を起動する
- まとめて見る場合は `tmp/phase-3-dummy/review.html` をブラウザで開く
- `review.html` のリンク先は `http://127.0.0.1:3001` から `3003` なので、CSSと画像が効いた状態で確認できる
- スマホで電話・LINEボタンがすぐ見えるか確認する
- 施工写真が多い場合に事例主役型、少ない場合に王道/一枚縦長型として自然か確認する
- 写真ゼロで「施工事例は準備中です」が失礼に見えないか確認する
- 違和感は `docs/verify/phase-3-findings.md` に残す
- `Codex修正対象` には `- [ ] 直す内容`、または `- [x] 問題なし` を書く
- 記入後に `npm run phase3:gate` が通ることを確認する
