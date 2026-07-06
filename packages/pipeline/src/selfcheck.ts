import { assertNoBannedWords } from "./ai";
import { generateSite } from "./generate";
import { normalizeSiteInput } from "./input";
import { fixtureLeads, unsolicitedPreviewConfig } from "./leads";
import { checkoutSessionParams, completeCheckoutSession } from "./stripe";

process.env.NEXT_PUBLIC_APP_URL ||= "http://localhost:3000";
process.env.STRIPE_SETUP_PRICE_ID ||= "price_setup";
process.env.STRIPE_MONTHLY_PRICE_ID ||= "price_monthly";

const empty = normalizeSiteInput({});
if (!empty.businessName || empty.photos.length !== 0) throw new Error("input normalization failed");

assertNoBannedWords({ text: "ていねいに対応します" });

const card = checkoutSessionParams({ orderId: "order-1", paymentMethod: "card" });
if (card.mode !== "subscription" || card.payment_method_types.includes("konbini")) throw new Error("card checkout branch failed");

const konbini = checkoutSessionParams({ orderId: "order-2", paymentMethod: "konbini" });
if (konbini.mode !== "payment" || konbini.payment_method_types[0] !== "konbini") throw new Error("konbini checkout branch failed");

const bank = checkoutSessionParams({ orderId: "order-3", paymentMethod: "bank_transfer" });
if (bank.mode !== "payment" || bank.payment_method_types[0] !== "customer_balance") throw new Error("bank transfer checkout branch failed");
if (bank.payment_method_options?.customer_balance?.bank_transfer?.type !== "jp_bank_transfer") throw new Error("bank transfer option failed");

let subscriptions = 0;
let status = "";
const deps = {
  createSubscription: async () => ({ id: `sub_${++subscriptions}` }),
  getOrderPayment: async () => ({ stripeSubscriptionId: subscriptions ? "sub_1" : undefined }),
  updateOrderPayment: async (input: { status?: string }) => { status = input.status ?? ""; },
  setOrderStatus: async (_orderId: string, next: string) => { status = next; }
};
await completeCheckoutSession({ mode: "payment", payment_status: "unpaid", customer: "cus_1", metadata: { orderId: "order-4", paymentMethod: "konbini" } }, deps);
if (status !== "waiting_payment" || subscriptions !== 0) throw new Error("unpaid webhook branch failed");
await completeCheckoutSession({ mode: "subscription", payment_status: "no_payment_required", customer: "cus_1", metadata: { orderId: "order-5", paymentMethod: "card" } }, deps);
if (status !== "paid") throw new Error("card trial webhook branch failed");
await completeCheckoutSession({ mode: "payment", payment_status: "paid", customer: "cus_1", metadata: { orderId: "order-4", paymentMethod: "konbini" } }, deps);
await completeCheckoutSession({ mode: "payment", payment_status: "paid", customer: "cus_1", metadata: { orderId: "order-4", paymentMethod: "konbini" } }, deps);
if (subscriptions !== 1) throw new Error("webhook idempotency failed");

const preview = unsolicitedPreviewConfig(fixtureLeads[0]);
if (!preview.previewBanner?.message.includes(fixtureLeads[0].businessName) || preview.cases[0].image !== "/stock/painting-placeholder.svg") {
  throw new Error("unsolicited preview config failed");
}

const result = await generateSite({ businessName: "", photos: [] });
if (!result.previewUrl.includes("preview.craftsite.jp")) throw new Error("preview fallback failed");

console.log("pipeline selfcheck ok");
