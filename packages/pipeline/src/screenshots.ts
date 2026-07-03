import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

export async function captureScreenshots(distDir: string) {
  const out = await mkdtemp(join(tmpdir(), "craftsite-shots-"));
  const browser = await chromium.launch();
  const paths: string[] = [];
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 1100]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(pathToFileURL(join(distDir, "index.html")).href);
    const path = join(out, `${width}.png`);
    await page.screenshot({ path });
    paths.push(path);
    await page.close();
  }
  await browser.close();
  return paths;
}
