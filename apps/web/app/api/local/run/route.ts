import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = process.cwd().endsWith("apps/web") ? "../.." : ".";
const commands: Record<string, string[]> = {
  leads: ["run", "leads:fetch"],
  dummy: ["run", "phase3:dummy"],
  check: ["run", "check"]
};

export async function POST(request: Request) {
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const args = commands[action];
  if (!args) return Response.redirect(new URL("/?status=unknown", request.url));
  try {
    await exec("npm", args, { cwd: root, timeout: 180000 });
    return Response.redirect(new URL(`/?status=${action}-ok`, request.url));
  } catch {
    return Response.redirect(new URL(`/?status=${action}-failed`, request.url));
  }
}
