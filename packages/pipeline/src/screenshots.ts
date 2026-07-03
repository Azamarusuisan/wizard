import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { serveStatic } from "./static-server";

export async function captureScreenshots(distDir: string) {
  const out = await mkdtemp(join(tmpdir(), "craftsite-shots-"));
  const site = await serveStatic(distDir);
  const browser = await chromium.launch();
  const paths: string[] = [];
  try {
    for (const [width, height] of [[375, 812], [768, 1024], [1440, 1100]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(site.url, { waitUntil: "networkidle" });
      const path = join(out, `${width}.png`);
      await page.screenshot({ path, fullPage: true });
      paths.push(path);
      await page.close();
    }
  } finally {
    await browser.close();
    await site.close();
  }
  return paths;
}
