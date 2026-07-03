import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { generateSite } from "@craftsite/pipeline";

const outDir = join(process.cwd(), "tmp", "phase-3-dummy");
const photoDir = join(outDir, "photos");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  await mkdir(photoDir, { recursive: true });

  const photos = await Promise.all(
    Array.from({ length: 8 }, (_, index) => makePhoto(index + 1))
  );

  const cases = [
    {
      name: "photos-rich",
      input: {
        businessName: "町田屋根外壁",
        representativeName: "佐藤 一郎",
        areas: ["町田市", "相模原市", "八王子市"],
        specialties: ["外壁塗装", "屋根塗装", "雨どい修理"],
        licenses: ["一級塗装技能士"],
        note: "近所の方に説明するように、わかりやすくお伝えします",
        phone: "050-1111-2222",
        photos
      }
    },
    {
      name: "photos-three",
      input: {
        businessName: "相模原ぬりかえ工房",
        representativeName: "鈴木 健",
        areas: ["相模原市", "町田市"],
        specialties: ["外壁塗装"],
        note: "小さな補修も相談できます",
        phone: "050-3333-4444",
        photos: photos.slice(0, 3)
      }
    },
    {
      name: "photos-zero",
      input: {
        businessName: "八王子塗装店",
        representativeName: "田中 誠",
        areas: ["八王子市"],
        specialties: [],
        note: "",
        phone: "050-5555-6666",
        photos: []
      }
    }
  ];

  const results = [];
  for (const item of cases) {
    const result = await generateSite(item.input);
    const savedDist = join(outDir, item.name, "dist");
    await mkdir(join(outDir, item.name), { recursive: true });
    await cp(result.distDir, savedDist, { recursive: true });
    results.push({
      name: item.name,
      previewUrl: result.previewUrl,
      localUrl: pathToFileURL(join(savedDist, "index.html")).href,
      template: result.config.template,
      theme: result.config.theme,
      cases: result.config.cases.length,
      distDir: savedDist
    });
  }

  await writeFile(join(outDir, "report.json"), JSON.stringify(results, null, 2));
  await writeFile(join(outDir, "review.html"), renderReview(results));
  console.log(JSON.stringify(results, null, 2));
  console.log(`review: ${pathToFileURL(join(outDir, "review.html")).href}`);
}

async function makePhoto(index: number) {
  const path = join(photoDir, `wall-after-${index}.jpg`);
  await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: index % 2 ? "#d7e0e8" : "#cfd8ce"
    }
  })
    .composite([
      { input: Buffer.from(`<svg width="1200" height="900"><rect x="160" y="180" width="880" height="520" fill="#fff" stroke="#17324d" stroke-width="28"/><rect x="${220 + index * 12}" y="260" width="180" height="240" fill="#f2b705"/><text x="600" y="790" font-family="sans-serif" font-size="58" text-anchor="middle" fill="#17324d">施工写真 ${index}</text></svg>`), top: 0, left: 0 }
    ])
    .jpeg({ quality: 88 })
    .toFile(path);
  return path;
}

function renderReview(results: Array<{ name: string; localUrl: string; template: string; theme: string; cases: number }>) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Phase 3 ダミー確認</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, "Hiragino Sans", sans-serif; color: #17202a; background: #f7fafc; }
      header, main { max-width: 1100px; margin: 0 auto; padding: 24px; }
      h1 { margin: 0 0 8px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
      article { background: white; border: 1px solid #d8dee4; border-radius: 8px; padding: 16px; }
      a { display: inline-block; margin-top: 12px; color: #17324d; font-weight: 800; }
      dl { display: grid; grid-template-columns: 7em 1fr; gap: 6px 10px; }
      dt { font-weight: 800; }
    </style>
  </head>
  <body>
    <header>
      <h1>Phase 3 ダミー確認</h1>
      <p>3パターンをスマホで開き、違和感を docs/verify/phase-3-findings.md に記入してください。</p>
    </header>
    <main class="grid">
      ${results.map((result) => `<article>
        <h2>${escapeHtml(result.name)}</h2>
        <dl>
          <dt>template</dt><dd>${escapeHtml(result.template)}</dd>
          <dt>theme</dt><dd>${escapeHtml(result.theme)}</dd>
          <dt>cases</dt><dd>${result.cases}</dd>
        </dl>
        <a href="${result.localUrl}">ローカル確認を開く</a>
      </article>`).join("")}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}
