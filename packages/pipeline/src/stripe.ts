import Stripe from "stripe";
import { ORDER_STATUS, type PaymentMethod } from "@craftsite/shared";
import { requiredEnv } from "./env";
import { notifyOwner } from "./notify";
import { updateOrderPayment, updateOrderStatus } from "./db";

const stripe = () => new Stripe(requiredEnv("STRIPE_SECRET_KEY"));

export type CheckoutInput = {
  orderId: string;
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
  paymentMethod?: PaymentMethod;
};

export function checkoutSessionParams(input: CheckoutInput) {
  const baseUrl = requiredEnv("NEXT_PUBLIC_APP_URL");
  const paymentMethod = input.paymentMethod ?? "card";
  const common = {
    customer_email: input.customerEmail,
    metadata: { orderId: input.orderId, paymentMethod },
    success_url: input.successUrl ?? `${baseUrl}/orders/${input.orderId}?paid=1`,
    cancel_url: input.cancelUrl ?? `${baseUrl}/orders/${input.orderId}?canceled=1`
  };

  if (paymentMethod === "card") {
    return {
      ...common,
      mode: "subscription" as const,
      line_items: [
        { price: requiredEnv("STRIPE_SETUP_PRICE_ID"), quantity: 1 },
        { price: requiredEnv("STRIPE_MONTHLY_PRICE_ID"), quantity: 1 }
      ],
      payment_method_types: ["card"],
      subscription_data: {
        trial_period_days: 31,
        metadata: { orderId: input.orderId, paymentMethod }
      }
    };
  }

  return {
    ...common,
    mode: "payment" as const,
    customer_creation: "always" as const,
    line_items: [{ price: requiredEnv("STRIPE_SETUP_PRICE_ID"), quantity: 1 }],
    payment_method_types: [paymentMethod === "konbini" ? "konbini" : "customer_balance"],
    payment_method_options: paymentMethod === "bank_transfer" ? { customer_balance: { funding_type: "bank_transfer" as const } } : undefined
  };
}

export async function createCheckoutSession(input: CheckoutInput) {
  const session = await stripe().checkout.sessions.create(checkoutSessionParams(input));
  await updateOrderPayment({
    orderId: input.orderId,
    status: ORDER_STATUS.waitingPayment,
    paymentMethod: input.paymentMethod ?? "card",
    stripeCheckoutSessionId: session.id
  });
  return session;
}

export async function handleStripeWebhook(body: string, signature: string | null) {
  if (!signature) throw new Error("Missing stripe-signature");

  const event = stripe().webhooks.constructEvent(
    body,
    signature,
    requiredEnv("STRIPE_WEBHOOK_SECRET")
  );

  if (event.type === "checkout.session.completed") {
    await completeCheckoutSession(event.data.object);
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await completeCheckoutSession(event.data.object);
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

async function completeCheckoutSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) throw new Error("Missing orderId");
  const paymentMethod = session.metadata?.paymentMethod;
  if (session.mode === "payment" && paymentMethod && paymentMethod !== "card") {
    const subscription = await stripe().subscriptions.create({
      customer: String(session.customer),
      items: [{ price: requiredEnv("STRIPE_MONTHLY_PRICE_ID") }],
      collection_method: "send_invoice",
      days_until_due: 14,
      trial_period_days: 31,
      metadata: { orderId, paymentMethod }
    });
    await updateOrderPayment({ orderId, status: ORDER_STATUS.paid, stripeSubscriptionId: subscription.id });
    return;
  }
  await setOrderStatus(orderId, ORDER_STATUS.paid);
}
