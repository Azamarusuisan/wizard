import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@craftsite/pipeline";

const root = join(process.cwd(), "tmp", "phase-3-dummy");
const cases = ["photos-rich", "photos-three", "photos-zero"];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  if (!existsSync(root)) {
    throw new Error("tmp/phase-3-dummy がありません。先に npm run phase3:dummy を実行してください。");
  }

  for (let index = 0; index < cases.length; index++) {
    const name = cases[index];
    const port = 3001 + index;
    const dist = join(root, name, "dist");
    await serveStatic(dist, port);
    console.log(`${name}: http://127.0.0.1:${port}`);
  }
  console.log(`review: ${join(root, "review.html")}`);
  await new Promise(() => undefined);
}
