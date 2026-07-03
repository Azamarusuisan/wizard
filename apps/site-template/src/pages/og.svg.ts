import type { APIRoute } from "astro";
import config from "../../site.config.json";

export const GET: APIRoute = async () =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
      <rect width="1200" height="630" fill="#17324d"/>
      <rect x="70" y="70" width="1060" height="490" rx="24" fill="#fff"/>
      <text x="120" y="210" font-family="sans-serif" font-size="72" font-weight="700" fill="#17324d">${escapeXml(config.businessName)}</text>
      <text x="120" y="325" font-family="sans-serif" font-size="54" fill="#17202a">${escapeXml(config.hero)}</text>
      <text x="120" y="440" font-family="sans-serif" font-size="42" fill="#52616f">${escapeXml(config.area)}</text>
      <text x="120" y="515" font-family="sans-serif" font-size="46" font-weight="700" fill="#9a3f12">${escapeXml(config.phone)}</text>
    </svg>`,
    { headers: { "Content-Type": "image/svg+xml" } }
  );

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char] ?? char);
}
