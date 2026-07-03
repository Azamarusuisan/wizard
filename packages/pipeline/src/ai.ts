import { THEME_NAMES, TEMPLATE_NAMES, type SiteConfig } from "@craftsite/shared";
import { readFile } from "node:fs/promises";
import type { SiteInput } from "./input";
import type { ProcessedPhoto } from "./images";
import { saveAiArtifact } from "./db";
import { warnOnce } from "./warnings";

export const BANNED_WORDS = ["絶対", "最安", "地域No.1", "必ず", "100%", "日本一"];

export async function generateSiteConfig(input: SiteInput, photos: ProcessedPhoto[], orderId?: string): Promise<SiteConfig> {
  const prompt = [
    "50〜70代の施主にも伝わる塗装店サイトのJSONを作る。",
    "禁止語: " + BANNED_WORDS.join("、"),
    JSON.stringify({ input, photoCaptions: photos.map((photo) => photo.caption) })
  ].join("\n");

  const generated = canUseClaude() ? await callClaude(prompt, orderId) : null;
  const config = generated ? cleanConfig(generated, input, photos) : fallbackConfig(input, photos);
  assertNoBannedWords(config);
  await saveAiArtifact({ orderId, kind: "site.config", provider: generated ? "claude" : "fallback", prompt, output: config });
  return config;
}

export async function reviewScreenshotNotes(screenshots: string[], orderId?: string) {
  const prompt = "素人っぽく見える点、レイアウト破綻、読みにくい点だけを短く指摘する。";
  if (!canUseOpenAiVision()) {
    const output: string[] = [];
    await saveAiArtifact({ orderId, kind: "screenshot.review", provider: "fallback", prompt, output });
    return output;
  }
  try {
    const content = await Promise.all(screenshots.map(async (path) => ({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${(await readFile(path)).toString("base64")}` }
    })));
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL,
        messages: [{ role: "user", content: [{ type: "text", text: `${prompt} JSONで {"notes": ["..."]} と返す。` }, ...content] }],
        response_format: { type: "json_object" }
      })
    });
    const json = await response.json();
    const output = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    const notes = Array.isArray(output.notes) ? output.notes.filter((note: unknown): note is string => typeof note === "string" && note.trim().length > 0) : [];
    await saveAiArtifact({ orderId, kind: "screenshot.review", provider: "openai", prompt, output: { screenshots, notes } });
    return notes;
  } catch (error) {
    await saveAiArtifact({ orderId, kind: "screenshot.review", provider: "openai", prompt, output: { screenshots }, error: String(error) });
    return [];
  }
}

export async function reviseConfigFromQa(config: SiteConfig, notes: string[], orderId?: string) {
  if (!notes.length || !canUseClaude()) return config;
  const prompt = [
    "次の指摘を直すため、site.config.jsonだけを修正してJSONで返す。",
    "大幅な構成追加はしない。電話導線と読みやすさを優先する。",
    "禁止語: " + BANNED_WORDS.join("、"),
    JSON.stringify({ config, notes })
  ].join("\n");
  const generated = await callClaude(prompt, orderId);
  const revised = generated ? mergeConfig(config, generated) : config;
  assertNoBannedWords(revised);
  await saveAiArtifact({ orderId, kind: "site.config.revision", provider: generated ? "claude" : "fallback", prompt, output: revised });
  return revised;
}

async function callClaude(prompt: string, orderId?: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    const error = await response.text();
    await saveAiArtifact({ orderId, kind: "site.config", provider: "claude", prompt, error });
    return null;
  }
  const json = await response.json();
  const text = json.content?.[0]?.text ?? "{}";
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
}

function canUseClaude() {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  if (process.env.ANTHROPIC_MODEL) return true;
  warnOnce("anthropic-model", "ANTHROPIC_MODEL is unset; using fallback site generation.");
  return false;
}

export function canUseOpenAiVision() {
  if (!process.env.OPENAI_API_KEY) return false;
  if (process.env.OPENAI_VISION_MODEL) return true;
  warnOnce("openai-vision-model", "OPENAI_VISION_MODEL is unset; using fallback image/screenshot review.");
  return false;
}

function fallbackConfig(input: SiteInput, photos: ProcessedPhoto[]): SiteConfig {
  return {
    businessName: input.businessName,
    representativeName: input.representativeName,
    template: photos.filter((photo) => photo.usable).length >= 6 ? "caseFirst" : photos.length <= 1 ? "singlePage" : "classic",
    theme: "honestNavy",
    phone: input.phone,
    lineUrl: "https://line.me/R/ti/p/@example",
    formUrl: "#contact",
    area: input.areas.join("・"),
    hero: `${input.areas[0]}周辺の外壁・屋根塗装をていねいに承ります`,
    tagline: "見積もり無料。小さな相談でもお電話ください。",
    strengths: ["地元で早く動けます", "写真で状態をわかりやすく説明", input.note],
    cases: photos.filter((photo) => photo.usable).slice(0, 6).map((photo, index) => ({
      title: `施工事例 ${index + 1}`,
      area: input.areas[0],
      image: "/stock/painting-placeholder.svg",
      caption: photo.caption
    })),
    prices: [
      { label: "外壁塗装", price: "60万円〜" },
      { label: "屋根塗装", price: "25万円〜" },
      { label: "外壁・屋根セット", price: "85万円〜" }
    ],
    flow: ["お問い合わせ", "現地確認", "お見積もり", "工事", "確認・お引き渡し"],
    greeting: `${input.representativeName}です。住まいの状態を見て、必要な工事だけをわかりやすくお伝えします。`,
    company: { address: input.areas[0], hours: "9:00〜18:00", closed: "日曜" }
  };
}

function cleanConfig(raw: Partial<SiteConfig>, input: SiteInput, photos: ProcessedPhoto[]) {
  return mergeConfig(fallbackConfig(input, photos), raw);
}

function mergeConfig(base: SiteConfig, raw: Partial<SiteConfig>) {
  return { ...base, ...raw, template: pick(raw.template, TEMPLATE_NAMES, base.template), theme: pick(raw.theme, THEME_NAMES, base.theme) };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function assertNoBannedWords(value: unknown) {
  const text = JSON.stringify(value);
  const hit = BANNED_WORDS.find((word) => text.includes(word));
  if (hit) throw new Error(`禁止語が含まれています: ${hit}`);
}
