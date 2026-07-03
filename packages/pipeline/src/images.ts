import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { saveAiArtifact } from "./db";

export type ProcessedPhoto = {
  source: string;
  output: Buffer;
  category: "exterior" | "roof" | "before" | "after" | "person" | "other";
  caption: string;
  usable: boolean;
  reason?: string;
};

export async function processPhotos(paths: string[], orderId?: string): Promise<ProcessedPhoto[]> {
  const photos = await Promise.all(paths.slice(0, 20).map((path) => processPhoto(path, orderId)));
  return photos.length ? photos : [stockPhoto()];
}

async function processPhoto(path: string, orderId?: string): Promise<ProcessedPhoto> {
  try {
    const image = sharp(path, { failOn: "none" }).rotate().resize({ width: 1600, withoutEnlargement: true }).modulate({ brightness: 1.06 });
    const stats = await image.stats();
    const output = await image.webp({ quality: 82 }).toBuffer();
    const usable = stats.channels.some((channel) => channel.stdev > 8);
    const vision = await classifyWithOpenAI(path, orderId);
    return {
      source: path,
      output,
      category: vision?.category ?? guessCategory(path),
      caption: vision?.caption ?? captionFor(path),
      usable,
      reason: usable ? undefined : "暗い、または判別しにくい写真です"
    };
  } catch (error) {
    return { ...stockPhoto(), source: path, reason: String(error) };
  }
}

async function classifyWithOpenAI(path: string, orderId?: string) {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompt = "写真を exterior, roof, before, after, person, other のどれかに分類し、塗装店サイト用の短い日本語キャプションをJSONで返す。";
  try {
    const image = await readFile(path);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      })
    });
    const json = await response.json();
    const output = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    await saveAiArtifact({ orderId, kind: "photo.classification", provider: "openai", prompt, output });
    return isCategory(output.category) && typeof output.caption === "string" ? output as Pick<ProcessedPhoto, "category" | "caption"> : null;
  } catch (error) {
    await saveAiArtifact({ orderId, kind: "photo.classification", provider: "openai", prompt, error: String(error) });
    return null;
  }
}

function isCategory(value: unknown): value is ProcessedPhoto["category"] {
  return ["exterior", "roof", "before", "after", "person", "other"].includes(String(value));
}

function stockPhoto(): ProcessedPhoto {
  return {
    source: "/stock/painting-placeholder.svg",
    output: Buffer.from(""),
    category: "other",
    caption: "施工事例は準備中です",
    usable: false,
    reason: "写真がないためストック画像を使います"
  };
}

function guessCategory(path: string): ProcessedPhoto["category"] {
  const name = path.toLowerCase();
  if (name.includes("roof") || name.includes("屋根")) return "roof";
  if (name.includes("before") || name.includes("施工前")) return "before";
  if (name.includes("after") || name.includes("施工後")) return "after";
  if (name.includes("person") || name.includes("代表")) return "person";
  if (name.includes("wall") || name.includes("外壁")) return "exterior";
  return "other";
}

function captionFor(path: string) {
  const category = guessCategory(path);
  return {
    exterior: "外壁まわりの施工写真です",
    roof: "屋根まわりの施工写真です",
    before: "施工前の状態です",
    after: "施工後の状態です",
    person: "担当者の写真です",
    other: "施工に関する写真です"
  }[category];
}
