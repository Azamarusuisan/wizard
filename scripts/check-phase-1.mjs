import { existsSync, readFileSync } from "node:fs";

const requiredPaths = [
  "apps/web/app/api/inngest/route.ts",
  "apps/site-template/site.config.json",
  "packages/pipeline/src/inngest.ts",
  "packages/pipeline/src/notify.ts",
  "packages/pipeline/src/input.ts",
  "packages/pipeline/src/images.ts",
  "packages/pipeline/src/ai.ts",
  "packages/pipeline/src/generate.ts",
  "packages/pipeline/src/delivery.ts",
  "packages/pipeline/src/qa.ts",
  "packages/pipeline/src/screenshots.ts",
  "packages/pipeline/src/static-server.ts",
  "packages/pipeline/src/db.ts",
  "packages/pipeline/src/selfcheck.ts",
  "packages/shared/src/index.ts",
  "supabase/schema.sql",
  "docs/env-and-deploy.md",
  "docs/verify/phase-1.md",
  "apps/site-template/src/lib/themes.ts",
  "apps/site-template/src/templates/Layout.astro",
  "apps/site-template/src/components/Header.astro",
  "apps/site-template/src/components/Hero.astro",
  "apps/site-template/src/components/CaseGrid.astro",
  "apps/site-template/tailwind.config.mjs",
  "apps/site-template/lighthouserc.cjs",
  "apps/site-template/public/stock/LICENSE.md",
  "apps/site-template/src/pages/og.svg.ts",
  "apps/web/app/layout.tsx",
  "apps/web/app/admin/generations/page.tsx",
  "apps/web/app/api/admin/retry-generation/route.ts",
  "apps/web/next.config.mjs",
  "scripts/screenshot-template.mjs",
  "scripts/run-phase-3-dummies.ts",
  "scripts/serve-phase-3-dummies.ts",
  "scripts/check-phase-3-findings.mjs",
  "scripts/check-phase-3-findings.test.mjs"
];

for (const path of requiredPaths) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
}

const schema = readFileSync("supabase/schema.sql", "utf8");
for (const table of ["leads", "orders", "sites", "revisions", "events", "ai_artifacts", "generation_logs"]) {
  if (!schema.includes(`create table ${table}`)) throw new Error(`Missing table ${table}`);
}

const env = readFileSync(".env.example", "utf8");
for (const key of ["SUPABASE_URL", "INNGEST_EVENT_KEY", "RESEND_API_KEY", "LINE_CHANNEL_ACCESS_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
  if (!env.includes(key)) throw new Error(`Missing env ${key}`);
}

console.log("craftsite scaffold ok");
