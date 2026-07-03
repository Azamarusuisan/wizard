import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SiteConfig } from "@craftsite/shared";

const exec = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const siteDir = join(repoRoot, "apps/site-template");
const siteConfigPath = join(siteDir, "site.config.json");

export async function buildPreview(config: SiteConfig) {
  // ponytail: one-process generator, use per-job temp worktrees if parallel builds matter.
  const previous = await readFile(siteConfigPath, "utf8");
  await writeFile(siteConfigPath, JSON.stringify(config, null, 2));
  try {
    await exec("npm", ["run", "build", "--workspace", "@craftsite/site-template"], { cwd: repoRoot });
    return { workdir: siteDir, distDir: join(siteDir, "dist") };
  } finally {
    await writeFile(siteConfigPath, previous);
  }
}

export async function deployPreview(distDir: string, slug: string) {
  if (!process.env.VERCEL_TOKEN) return `${process.env.SITE_PREVIEW_BASE_URL ?? "https://preview.craftsite.jp"}/${slug}`;
  const { stdout } = await exec("npx", ["vercel", "deploy", distDir, "--yes", "--token", process.env.VERCEL_TOKEN], { cwd: repoRoot });
  return stdout.trim().split(/\s+/).at(-1) ?? "";
}

export async function readBuiltHtml(distDir: string) {
  return readFile(join(distDir, "index.html"), "utf8");
}
