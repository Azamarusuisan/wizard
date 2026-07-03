# Phase 3 ダミー通し試験メモ

`未記入` を実際のメモ、または `問題なし` に置き換える。

## photos-rich

- 結果: `npm run phase3:dummy` 成功。`caseFirst`、施工事例6件。
- 気になった点:
  - 修正後の `http://127.0.0.1:3001` 確認ではCSSと画像が表示される。事例主役型として見られる状態になった。

## photos-three

- 結果: `npm run phase3:dummy` 成功。`classic`、施工事例3件。
- 気になった点:
  - 修正後の `http://127.0.0.1:3002` 確認ではCSSと画像が表示され、電話・LINE導線もボタンとして見える。

## photos-zero

- 結果: `npm run phase3:dummy` 成功。`singlePage`、施工事例0件。
- 気になった点:
  - 修正後の `http://127.0.0.1:3003` 確認ではCSSが表示され、写真ゼロ版も貧相すぎる印象ではない。

## Codex修正対象

- [x] `tmp/phase-3-dummy/review.html` のローカル確認を `file://` ではなく静的サーバ経由で開けるようにする。CSS・画像が効いた状態で3パターンを再確認する。
