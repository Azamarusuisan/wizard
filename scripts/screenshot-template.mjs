import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.env.SITE_TEMPLATE_URL ?? "http://localhost:4321";
const sizes = [
  [375, 812],
  [768, 1024],
  [1440, 1100]
];

const browser = await chromium.launch();
mkdirSync("screenshots", { recursive: true });
for (const [width, height] of sizes) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `screenshots/${width}.png` });
  await page.close();
}
await browser.close();
