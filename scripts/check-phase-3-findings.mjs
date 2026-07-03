import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = "docs/verify/phase-3-findings.md";
  const text = readFileSync(path, "utf8");
  const missing = checkFindings(text);

  if (missing.length) {
    console.error(`Phase 3 owner findings are not complete: ${missing.join(", ")}`);
    console.error(`Fill ${path}, then rerun npm run phase3:gate`);
    process.exit(1);
  }

  console.log("phase 3 owner findings complete");
}

export function checkFindings(text) {
const cases = ["photos-rich", "photos-three", "photos-zero"];
const missing = [];

for (const name of cases) {
  const section = text.match(new RegExp(`## ${name}([\\s\\S]*?)(?=\\n## |$)`))?.[1] ?? "";
  const notes = section.match(/- 気になった点:\s*([\s\S]*?)(?=\n## |\n- 結果:|$)/)?.[1]?.trim() ?? "";
  if (!notes || notes.includes("未記入")) missing.push(name);
}

const fixList = text.match(/## Codex修正対象([\s\S]*)$/)?.[1] ?? "";
const items = [...fixList.matchAll(/- \[([ x])\]\s*(.+\S)/g)].map((match) => ({
  checked: match[1] === "x",
  text: match[2].trim()
}));
const hasActionableItem = items.some((item) => !item.checked && !item.text.includes("未記入"));
const hasNoIssueDecision = items.some((item) => item.checked && item.text.includes("問題なし"));
if (!hasActionableItem && !hasNoIssueDecision) missing.push("Codex修正対象");

return missing;
}
