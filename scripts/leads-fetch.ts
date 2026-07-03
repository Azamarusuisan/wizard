import { mkdir, writeFile } from "node:fs/promises";
import { fetchPaintingLeads, writeLeadsCsv } from "@craftsite/pipeline";

async function main() {
  await mkdir("tmp", { recursive: true });
  const leads = await fetchPaintingLeads();
  await writeFile("tmp/leads.json", JSON.stringify(leads, null, 2));
  await writeLeadsCsv(leads);
  console.log(`saved ${leads.length} leads to tmp/leads.json and tmp/leads.csv`);
}

main();
