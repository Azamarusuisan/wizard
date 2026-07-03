import { assertNoBannedWords } from "./ai";
import { generateSite } from "./generate";
import { normalizeSiteInput } from "./input";

const empty = normalizeSiteInput({});
if (!empty.businessName || empty.photos.length !== 0) throw new Error("input normalization failed");

assertNoBannedWords({ text: "ていねいに対応します" });

const result = await generateSite({ businessName: "", photos: [] });
if (!result.previewUrl.includes("preview.craftsite.jp")) throw new Error("preview fallback failed");

console.log("pipeline selfcheck ok");
