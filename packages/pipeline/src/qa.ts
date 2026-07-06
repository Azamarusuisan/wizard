import { readBuiltHtml } from "./build";
import { existsSync } from "node:fs";
import { join } from "node:path";

export async function machineCheck(distDir: string, phone: string) {
  const html = await readBuiltHtml(distDir);
  const errors = [
    html.includes('href="tel:') ? "" : "電話リンクがありません",
    phone.match(/^0\d{1,4}-?\d{1,4}-?\d{3,4}$/) ? "" : "電話番号の形式を確認してください",
    html.includes("LocalBusiness") ? "" : "構造化データがありません",
    html.includes("og:image") ? "" : "OGP画像がありません",
    html.includes('class="preview-banner"') && !html.includes('name="robots" content="noindex,nofollow"') ? "勝手にプレビューにnoindexがありません" : "",
    ...missingLocalAssets(html, distDir),
    ...missingInternalAnchors(html)
  ].filter(Boolean);
  return { ok: errors.length === 0, errors };
}

function missingLocalAssets(html: string, distDir: string) {
  return [...html.matchAll(/\b(?:src|href)="(\/[^"#?]+)[^"]*"/g)]
    .map(([, path]) => path)
    .filter((path) => !path.startsWith("/api/") && !path.startsWith("/orders/"))
    .filter((path) => path !== "/" && !existsSync(join(distDir, path)))
    .map((path) => `ファイルが見つかりません: ${path}`);
}

function missingInternalAnchors(html: string) {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
  return [...html.matchAll(/\bhref="#([^"]+)"/g)]
    .map(([, id]) => id)
    .filter((id) => !ids.has(id))
    .map((id) => `ページ内リンク先が見つかりません: #${id}`);
}
