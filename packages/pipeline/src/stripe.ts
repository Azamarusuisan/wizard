import Stripe from "stripe";
import { ORDER_STATUS } from "@craftsite/shared";
import { requiredEnv } from "./env";
import { notifyOwner } from "./notify";
import { updateOrderStatus } from "./db";

const stripe = () => new Stripe(requiredEnv("STRIPE_SECRET_KEY"));

export async function createCheckoutSession(input: {
  orderId: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}) {
  const baseUrl = requiredEnv("NEXT_PUBLIC_APP_URL");
  return stripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: input.customerEmail,
    line_items: [
      { price: requiredEnv("STRIPE_SETUP_PRICE_ID"), quantity: 1 },
      { price: requiredEnv("STRIPE_MONTHLY_PRICE_ID"), quantity: 1 }
    ],
    payment_method_types: ["card", "konbini", "customer_balance"],
    subscription_data: {
      trial_period_days: 31,
      metadata: { orderId: input.orderId }
    },
    metadata: { orderId: input.orderId },
    success_url: input.successUrl ?? `${baseUrl}/orders/${input.orderId}?paid=1`,
    cancel_url: input.cancelUrl ?? `${baseUrl}/orders/${input.orderId}?canceled=1`
  });
}

export async function handleStripeWebhook(body: string, signature: string | null) {
  if (!signature) throw new Error("Missing stripe-signature");

  const event = stripe().webhooks.constructEvent(
    body,
    signature,
    requiredEnv("STRIPE_WEBHOOK_SECRET")
  );

  if (event.type === "checkout.session.completed") {
    await setOrderStatus(event.data.object.metadata?.orderId, ORDER_STATUS.paid);
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await setOrderStatus(event.data.object.metadata?.orderId, ORDER_STATUS.paid);
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await setOrderStatus(event.data.object.metadata?.orderId, ORDER_STATUS.waitingPayment);
    await notifyOwner({
      subject: "決済失敗",
      message: `注文 ${event.data.object.metadata?.orderId ?? "unknown"} の入金確認に失敗しました。`
    });
  }
}

async function setOrderStatus(orderId: string | undefined, status: string) {
  if (!orderId) throw new Error("Missing orderId");
  await updateOrderStatus(orderId, status);
}
