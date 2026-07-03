import { Inngest } from "inngest";
import { generateSite } from "./generate";
import { notifyOwner } from "./notify";

export const inngest = new Inngest({ id: "craftsite" });

export const siteGenerate = inngest.createFunction(
  { id: "site-generate", retries: 2 },
  { event: "site.generate" },
  async ({ event, step }) => {
    await step.run("notify-start", () =>
      notifyOwner({
        subject: "サイト生成開始",
        message: `注文 ${event.data.orderId ?? "unknown"} の生成を開始しました。`
      })
    );
    return step.run("generate", () => generateSite(event.data));
  }
);

export const siteRevise = inngest.createFunction(
  { id: "site-revise", retries: 2 },
  { event: "site.revise" },
  async ({ event, step }) => {
    await step.run("notify-start", () =>
      notifyOwner({
        subject: "修正開始",
        message: `サイト ${event.data.siteId ?? "unknown"} の修正を開始しました。`
      })
    );
  }
);

export const dmRender = inngest.createFunction(
  { id: "dm-render" },
  { event: "dm.render" },
  async ({ event, step }) => {
    await step.run("notify-start", () =>
      notifyOwner({
        subject: "DM生成開始",
        message: `リード ${event.data.leadId ?? "unknown"} のDM生成を開始しました。`
      })
    );
  }
);

export const functions = [siteGenerate, siteRevise, dmRender];
