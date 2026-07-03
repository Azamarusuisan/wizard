import { readFile } from "node:fs/promises";
import { fixtureLeads, writeLeadsCsv } from "@craftsite/pipeline";

async function main() {
  const leads = await readFile("tmp/leads.json", "utf8").then((text) => JSON.parse(text)).catch(() => fixtureLeads);
  const path = await writeLeadsCsv(leads);
  console.log(`exported ${leads.length} leads to ${path}`);
}

main();
