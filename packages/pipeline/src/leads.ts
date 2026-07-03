import { readFile, writeFile } from "node:fs/promises";
import { type Lead, type SiteConfig } from "@craftsite/shared";
import { saveLeads } from "./db";

const areas = ["町田市", "相模原市", "八王子市"];
const terms = ["塗装店", "外壁塗装", "屋根塗装", "リフォーム 塗装"];
const portalHosts = ["nuri-kae.jp", "homepro.jp", "gaiheki-concierge.com", "facebook.com", "instagram.com", "lin.ee", "ameblo.jp", "x.com", "twitter.com"];

export const fixtureLeads: Lead[] = Array.from({ length: 10 }, (_, index) => {
  const area = areas[index % areas.length];
  return {
    placeId: `fixture-${index + 1}`,
    slug: slugify(`${area} 見本塗装 ${index + 1}`),
    businessName: `${area} 見本塗装 ${index + 1}`,
    address: `${area}本町${index + 1}-1`,
    phone: `042-000-00${String(index).padStart(2, "0")}`,
    website: index % 3 === 0 ? undefined : "https://www.nuri-kae.jp/company/example",
    source: "fixture",
    reviewSummary: "近隣対応と説明のわかりやすさに触れた口コミがあります。",
    excluded: false,
    raw: { fixture: true }
  };
});

export async function fetchPaintingLeads() {
  const leads = process.env.GOOGLE_PLACES_API_KEY ? await fetchGoogleLeads() : fixtureLeads;
  const filtered = dedupe(leads).filter((lead) => lead.phone && lead.address && isTargetWebsite(lead.website));
  await saveLeads(filtered);
  console.log(`leads fetched=${leads.length} filtered=${filtered.length}`);
  return filtered;
}

export async function writeLeadsCsv(leads: Lead[], path = "tmp/leads.csv") {
  await writeFile(path, [csvHeader, ...leads.map(toCsvRow)].join("\n") + "\n");
  return path;
}

export async function readLeadsCsv(path = "tmp/leads.csv") {
  const rows = (await readFile(path, "utf8")).trim().split(/\r?\n/).slice(1);
  return rows.map(fromCsvRow);
}

export function unsolicitedPreviewConfig(lead: Lead): SiteConfig {
  return {
    businessName: lead.businessName,
    representativeName: "代表者様",
    template: "singlePage",
    theme: "honestNavy",
    phone: lead.phone,
    lineUrl: process.env.LINE_OFFICIAL_URL ?? "#",
    formUrl: process.env.APPLY_URL ?? "#",
    area: lead.address.split(/[市区町村]/)[0] ? `${lead.address.split(/[市区町村]/)[0]}周辺` : lead.address,
    hero: `${lead.businessName}様の強みが伝わる塗装店ホームページ見本`,
    tagline: "公開情報をもとに、見やすさと電話しやすさを重視して作った見本です。",
    strengths: ["電話番号を大きく表示", "施工内容を施主向けに整理", "スマホでも読みやすい文字サイズ"],
    cases: [{ title: "施工事例", area: lead.address, image: "/stock/painting-placeholder.svg", caption: "写真は見本用のストック画像です" }],
    prices: [
      { label: "外壁塗装", price: "目安を掲載できます" },
      { label: "屋根塗装", price: "写真と合わせて案内できます" }
    ],
    flow: ["お問い合わせ", "現地確認", "お見積もり", "工事", "確認"],
    greeting: lead.reviewSummary ?? "公開情報だけで失礼のない範囲に文言を抑えています。実際の公開時は内容を確認して差し替えます。",
    company: { address: lead.address, hours: "9:00〜18:00", closed: "日曜" },
    previewBanner: {
      leadId: lead.id ?? lead.placeId,
      message: `このページは${lead.businessName}様のためにお作りした見本です`,
      applyUrl: process.env.APPLY_URL ?? "#"
    },
    eventsBaseUrl: process.env.PUBLIC_EVENTS_BASE_URL
  };
}

async function fetchGoogleLeads() {
  const found: Lead[] = [];
  for (const area of areas) {
    for (const term of terms) {
      let pageToken: string | undefined;
      for (let page = 0; page < 3; page++) {
        if (pageToken) await new Promise((resolve) => setTimeout(resolve, 2000));
        const search = await google("textsearch", pageToken ? { pagetoken: pageToken } : { query: `${area} ${term}` });
        for (const result of search.results ?? []) {
          const detail = await google("details", {
            place_id: result.place_id,
            fields: "place_id,name,formatted_address,formatted_phone_number,website,reviews,photos,url,business_status"
          });
          const lead = normalizePlace(detail.result);
          if (lead) found.push(lead);
        }
        pageToken = search.next_page_token;
        if (!pageToken) break;
      }
    }
  }
  return found;
}

async function google(kind: "textsearch" | "details", params: Record<string, string>) {
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${kind}/json`);
  url.searchParams.set("key", process.env.GOOGLE_PLACES_API_KEY!);
  url.searchParams.set("language", "ja");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Places ${kind} failed: ${response.status}`);
  return response.json();
}

function normalizePlace(place: any): Lead | null {
  if (!place?.name || !place.formatted_address || !place.formatted_phone_number) return null;
  const website = typeof place.website === "string" ? place.website : undefined;
  return {
    placeId: place.place_id,
    slug: slugify(place.name),
    businessName: place.name,
    address: place.formatted_address,
    phone: place.formatted_phone_number,
    website,
    source: "google_places",
    reviewSummary: summarizeReviews(place.reviews),
    placesPhotoUrl: place.photos?.[0]?.photo_reference,
    excluded: !isTargetWebsite(website),
    raw: place
  };
}

function summarizeReviews(reviews: any[] | undefined) {
  if (!Array.isArray(reviews) || !reviews.length) return undefined;
  return "口コミでは、対応や説明に関する評価が見られます。";
}

function isTargetWebsite(website?: string) {
  if (!website) return true;
  try {
    const host = new URL(website).hostname.replace(/^www\./, "");
    return portalHosts.some((portal) => host === portal || host.endsWith(`.${portal}`));
  } catch {
    return false;
  }
}

function dedupe(leads: Lead[]) {
  return [...new Map(leads.map((lead) => [lead.placeId ?? `${lead.businessName}-${lead.phone}`, lead])).values()];
}

export function slugify(value: string) {
  return encodeURIComponent(value.toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]+/gu, ""));
}

const csvHeader = "placeId,slug,businessName,address,phone,website,source,reviewSummary,placesPhotoUrl,excluded";

function toCsvRow(lead: Lead) {
  return [lead.placeId, lead.slug, lead.businessName, lead.address, lead.phone, lead.website, lead.source, lead.reviewSummary, lead.placesPhotoUrl, String(lead.excluded)].map(csvCell).join(",");
}

function fromCsvRow(row: string): Lead {
  const [placeId, slug, businessName, address, phone, website, source, reviewSummary, placesPhotoUrl, excluded] = parseCsvRow(row);
  return { placeId, slug, businessName, address, phone, website, source, reviewSummary, placesPhotoUrl, excluded: excluded === "true" };
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function parseCsvRow(row: string) {
  const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "").replaceAll('""', '"')) ?? [];
  return cells.slice(0, 10);
}
