import { ORDER_STATUS, type SiteConfig } from "@craftsite/shared";
import { buildPreview, deployPreview } from "./build";
import { deliverPreview } from "./delivery";
import { generateSiteConfig, reviewScreenshotNotes, reviseConfigFromQa } from "./ai";
import { logGeneration, updateOrderStatus } from "./db";
import { processPhotos } from "./images";
import { normalizeSiteInput, type SiteInput } from "./input";
import { notifyOwner } from "./notify";
import { machineCheck } from "./qa";
import { captureScreenshots } from "./screenshots";

export async function generateSite(raw: Partial<SiteInput> & { orderId?: string } = {}) {
  const started = Date.now();
  const orderId = raw.orderId;
  const input = normalizeSiteInput(raw);
  await updateOrderStatusIfPresent(orderId, ORDER_STATUS.generating);
  await logGeneration({ orderId, step: "input", status: "ok", detail: input });

  try {
    const photos = await processPhotos(input.photos, orderId);
    let config = await generateSiteConfig(input, photos, orderId);
    let checked = await buildAndCheck(config);
    for (let attempt = 1; attempt <= 2; attempt++) {
      const screenshots = await captureScreenshots(checked.distDir);
      const notes = await reviewScreenshotNotes(screenshots, orderId);
      await logGeneration({ orderId, step: `qa-${attempt}`, status: "ok", detail: { notes } });
      if (!notes.length || attempt === 2) break;
      config = await reviseConfigFromQa(config, notes, orderId);
      checked = await buildAndCheck(config);
    }
    const previewUrl = await deployPreview(checked.distDir, slugify(config.businessName));
    await deliverPreview({
      customerEmail: (raw as { customerEmail?: string }).customerEmail,
      customerLineUserId: (raw as { customerLineUserId?: string }).customerLineUserId,
      businessName: config.businessName,
      previewUrl
    });
    await updateOrderStatusIfPresent(orderId, ORDER_STATUS.previewReady);
    const seconds = Math.round((Date.now() - started) / 1000);
    if (seconds > 900) {
      await notifyOwner({ subject: "生成が15分を超過", message: `注文 ${orderId ?? "unknown"} の生成に ${seconds} 秒かかりました。` });
    }
    await logGeneration({ orderId, step: "done", status: "ok", detail: { seconds, previewUrl } });
    return { config, previewUrl, distDir: checked.distDir };
  } catch (error) {
    await updateOrderStatusIfPresent(orderId, ORDER_STATUS.failed);
    await notifyOwner({ subject: "生成失敗", message: `注文 ${orderId ?? "unknown"} の生成に失敗しました。${String(error)}` });
    await logGeneration({ orderId, step: "failed", status: "error", detail: { error: String(error) } });
    throw error;
  }
}

async function buildAndCheck(config: SiteConfig) {
  const { distDir } = await buildPreview(config);
  const check = await machineCheck(distDir, config.phone);
  if (!check.ok) throw new Error(check.errors.join(" / "));
  return { config, distDir };
}

async function updateOrderStatusIfPresent(orderId: string | undefined, status: string) {
  if (orderId) await updateOrderStatus(orderId, status);
}

function slugify(value: string) {
  return encodeURIComponent(value.toLowerCase().replace(/\s+/g, "-"));
}
