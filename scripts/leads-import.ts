import { mkdir, writeFile } from "node:fs/promises";
import { readLeadsCsv, saveLeads } from "@craftsite/pipeline";

async function main() {
  await mkdir("tmp", { recursive: true });
  const leads = await readLeadsCsv(process.argv[2] ?? "tmp/leads.csv");
  await saveLeads(leads);
  await writeFile("tmp/leads.json", JSON.stringify(leads, null, 2));
  console.log(`imported ${leads.length} leads from CSV`);
}

main();
