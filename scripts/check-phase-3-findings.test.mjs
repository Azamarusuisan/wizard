import assert from "node:assert/strict";
import { checkFindings } from "./check-phase-3-findings.mjs";

const base = `
# Phase 3 ダミー通し試験メモ

## photos-rich
- 気になった点:
  - 問題なし

## photos-three
- 気になった点:
  - ボタンが少し低い

## photos-zero
- 気になった点:
  - 問題なし

## Codex修正対象
`;

assert.deepEqual(checkFindings(`${base}\n- [ ] ボタン位置を上げる\n`), []);
assert.deepEqual(checkFindings(`${base}\n- [x] 問題なし\n`), []);
assert.deepEqual(checkFindings(`${base}\n- [x] ボタン位置を上げた\n`), []);
assert(checkFindings(`${base}\n- [ ] 未記入\n`).includes("Codex修正対象"));
assert(checkFindings(base.replace("ボタンが少し低い", "未記入") + "\n- [ ] ボタン位置を上げる\n").includes("photos-three"));

console.log("phase 3 findings gate tests ok");
