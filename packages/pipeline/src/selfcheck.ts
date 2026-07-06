import { assertNoBannedWords } from "./ai";
import { generateSite } from "./generate";
import { normalizeSiteInput } from "./input";
import { fixtureLeads, unsolicitedPreviewConfig } from "./leads";

process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000";

const empty = normalizeSiteInput({});
if (!empty.businessName || empty.photos.length !== 0) throw new Error("input normalization failed");

assertNoBannedWords({ text: "ていねいに対応します" });

const preview = unsolicitedPreviewConfig(fixtureLeads[0]);
if (!preview.previewBanner?.message.includes(fixtureLeads[0].businessName) || preview.cases[0].image !== "/stock/painting-placeholder.svg") {
  throw new Error("unsolicited preview config failed");
}

const result = await generateSite({ businessName: "", photos: [] });
if (!result.previewUrl.includes("preview.craftsite.jp")) throw new Error("preview fallback failed");

console.log("pipeline selfcheck ok");
